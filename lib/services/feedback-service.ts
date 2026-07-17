/**
 * Feedback service — shared helpers for the UI-Fix feedback queue.
 *
 * The interesting piece is buildFeedbackAgentRequest(): it turns a set of
 * pinned-element feedback rows into a single, structured natural-language
 * request for the agent orchestrator (createPlan). Keeping it here (not in
 * the route) makes it unit-testable and reusable from a future cron/batch
 * dispatcher.
 */

import type { Feedback } from "@prisma/client";
import { SUITE_REPO_FULL_NAME } from "@/lib/agents/cross-repo/policy";

/** Hard cap on the composed request so we never hand the planner an
 *  unbounded blob. Extra items beyond the cap are summarized as a count. */
const MAX_REQUEST_CHARS = 16000;

const CATEGORY_LABEL: Record<Feedback["category"], string> = {
  bug: "Bug",
  ux: "UX",
  feature: "Feature",
  general: "General",
};

function renderItem(item: Feedback, index: number): string {
  const lines: string[] = [];
  lines.push(`── Feedback #${index + 1} [${CATEGORY_LABEL[item.category]}] ──`);
  lines.push(`Page: ${item.pageUrl}`);
  if (item.elementSelector) {
    const type = item.elementType ? `<${item.elementType}> ` : "";
    lines.push(`Element: ${type}selector \`${item.elementSelector}\``);
  }
  if (item.elementText) {
    lines.push(`Location: ${item.elementText}`);
  }
  lines.push(`Reported by: ${item.submittedBy?.trim() || "anonymous"}`);
  lines.push(`Note: ${item.content.trim()}`);
  return lines.join("\n");
}

/**
 * Compose one agent request that asks Claude to correct every reported
 * UI/UX issue. The element selector + human-readable location trail give
 * the agent a stable way to find each element in the codebase.
 */
export function buildFeedbackAgentRequest(items: Feedback[]): string {
  const header = [
    `Correct the UI/UX issues reported by MacTech teammates via the UI-Fix`,
    `element-pinpoint browser extension. ${items.length} item${items.length === 1 ? "" : "s"} follow${items.length === 1 ? "s" : ""}.`,
    ``,
    `For EACH item: use the CSS selector and the human-readable location`,
    `trail to locate the element in the codebase, understand the reporter's`,
    `intent, and implement the smallest correct fix. Group related fixes and`,
    `note anything that needs a product decision rather than a code change.`,
    ``,
  ].join("\n");

  const rendered: string[] = [];
  let used = header.length;
  let truncatedAt = -1;

  for (let i = 0; i < items.length; i++) {
    const block = renderItem(items[i], i);
    // +2 for the blank-line separator between blocks.
    if (used + block.length + 2 > MAX_REQUEST_CHARS) {
      truncatedAt = i;
      break;
    }
    rendered.push(block);
    used += block.length + 2;
  }

  let out = header + rendered.join("\n\n");
  if (truncatedAt >= 0) {
    out += `\n\n(+${items.length - truncatedAt} more item${
      items.length - truncatedAt === 1 ? "" : "s"
    } omitted from this prompt for length.)`;
  }
  return out;
}

/** Minimal shape of an AppRegistry row needed to map a page to its repo. */
export interface RepoMappingRow {
  subdomain: string | null;
  apexDomain: string | null;
  publicUrl: string | null;
  repoFullName: string | null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Resolve which GitHub repo a piece of feedback belongs to, from its
 * pageUrl. Matches the host against AppRegistry (subdomain.apexDomain or
 * publicUrl); falls back to the Suite's own repo for Suite surfaces and
 * anything we can't map more specifically — that's where element-pinpointed
 * feedback about the admin console lives.
 */
export function resolveRepoForPage(
  pageUrl: string,
  appRows: RepoMappingRow[],
): string {
  const host = hostOf(pageUrl);
  if (!host) return SUITE_REPO_FULL_NAME;

  for (const app of appRows) {
    if (!app.repoFullName) continue;
    const fqdn =
      app.subdomain && app.apexDomain
        ? `${app.subdomain}.${app.apexDomain}`.toLowerCase()
        : null;
    const publicHost = app.publicUrl ? hostOf(app.publicUrl) : null;
    if ((fqdn && host === fqdn) || (publicHost && host === publicHost)) {
      return app.repoFullName;
    }
  }
  return SUITE_REPO_FULL_NAME;
}

/**
 * Group feedback items by the repo they map to, so we file one @claude
 * routine per repo. Preserves input order within each group.
 */
export function groupFeedbackByRepo(
  items: Feedback[],
  appRows: RepoMappingRow[],
): Map<string, Feedback[]> {
  const groups = new Map<string, Feedback[]>();
  for (const item of items) {
    const repo = resolveRepoForPage(item.pageUrl, appRows);
    const bucket = groups.get(repo);
    if (bucket) bucket.push(item);
    else groups.set(repo, [item]);
  }
  return groups;
}

/**
 * Context block appended to the @claude issue: tells Claude Code the
 * selectors/trails come from the deployed DOM and to map them to source.
 */
export function buildFeedbackContextHint(items: Feedback[]): string {
  const lines = [
    "This request was generated from the UI-Fix element-pinpoint extension.",
    "Each item's `selector` and location trail were captured from the live",
    "DOM of the deployed app — use them to locate the corresponding component",
    "in this repo's source. Pages referenced:",
    "",
  ];
  const pages = Array.from(new Set(items.map((i) => i.pageUrl)));
  for (const p of pages.slice(0, 20)) lines.push(`- ${p}`);
  return lines.join("\n");
}
