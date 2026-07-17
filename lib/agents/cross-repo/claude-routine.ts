/**
 * Shared "@claude routine" filing — the single path for turning an intent
 * into a GitHub issue that the Claude Code GitHub App reads and opens a PR
 * from. Used by:
 *   - the `open_repo_pull_request` AgentOps capability (plan/approve flow), and
 *   - the UI-Fix feedback dispatch (POST /api/feedback/dispatch).
 *
 * It does NOT call Anthropic directly: the Suite files an issue with
 * `@claude <intent>` plus ground rules, and Claude Code (installed as a
 * GitHub App on the target repo) does the actual work. That reuses the
 * Claude Code subscription instead of paying per-token via the API, and the
 * opened PR — reviewed and merged by a human on GitHub — is the real gate.
 *
 * All the safety checks live here so both callers share one contract:
 *   - ENABLE_CROSS_REPO_AGENT + GITHUB_TOKEN configured
 *   - repo is on the code-defined allowlist (policy.ts)
 *   - GitHub client is live
 */

import { crossRepoAgentConfigured } from "@/lib/env";
import { getGitHubClient } from "@/lib/integrations/github/client";
import {
  AGENT_BRANCH_PREFIX,
  AGENT_PR_FOOTER,
  CROSS_REPO_ALLOWLIST,
  MAX_TOTAL_LINES_PER_PR,
  isAllowlistedRepo,
} from "./policy";

export interface FileClaudeRoutineInput {
  repoFullName: string;
  intent: string;
  contextHint?: string;
  extraRules?: string;
}

export type FileClaudeRoutineResult =
  | {
      ok: true;
      repoFullName: string;
      issueNumber: number;
      issueUrl: string;
      issueBody: string;
    }
  | {
      ok: false;
      reason: string;
      detail?: Record<string, unknown>;
    };

/**
 * File a `@claude <intent>` issue in `repoFullName`. Returns the issue
 * number + URL on success, or a structured refusal the caller can surface
 * or audit. Never throws for the expected refusal paths.
 */
export async function fileClaudeRoutineIssue(
  input: FileClaudeRoutineInput,
): Promise<FileClaudeRoutineResult> {
  const repoFullName = input.repoFullName.trim();
  const intent = input.intent.trim();

  if (!crossRepoAgentConfigured()) {
    return {
      ok: false,
      reason: "agent_not_configured",
      detail: {
        message:
          "ENABLE_CROSS_REPO_AGENT and GITHUB_TOKEN must both be set on the Suite Railway service.",
      },
    };
  }
  if (!repoFullName || !intent) {
    return { ok: false, reason: "invalid_input", detail: { repoFullName } };
  }
  if (!isAllowlistedRepo(repoFullName)) {
    return {
      ok: false,
      reason: "repo_not_allowlisted",
      detail: { repoFullName, allowlist: [...CROSS_REPO_ALLOWLIST] },
    };
  }
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) {
    return { ok: false, reason: "invalid_repo_full_name", detail: { repoFullName } };
  }

  const gh = getGitHubClient();
  if (!gh.configured) {
    return {
      ok: false,
      reason: "github_not_configured",
      detail: { message: "GITHUB_TOKEN missing or ENABLE_GITHUB_SYNC=false." },
    };
  }

  const issueBody = renderClaudeRoutineIssueBody({
    intent,
    contextHint: input.contextHint?.trim() ?? "",
    extraRules: input.extraRules?.trim() ?? "",
  });
  const issueTitle = `[mactech-agent] ${truncate(intent.split("\n")[0]!, 60)}`;

  const result = await gh.createIssue(owner, repo, {
    title: issueTitle,
    body: issueBody,
    labels: ["mactech-agent", "automation"],
  });
  if (!result.ok) {
    return {
      ok: false,
      reason: `create_issue_${result.reason}`,
      detail: { repoFullName, ghStatus: result.status },
    };
  }

  return {
    ok: true,
    repoFullName,
    issueNumber: result.data.number,
    issueUrl: result.data.htmlUrl,
    issueBody,
  };
}

/**
 * Render the issue body sent to the Claude Code GitHub App: the `@claude`
 * mention with the intent, optional context, and the standing ground
 * rules (branch prefix, path denylist, LOC ceiling, no auto-merge).
 */
export function renderClaudeRoutineIssueBody(args: {
  intent: string;
  contextHint: string;
  extraRules: string;
}): string {
  const parts: string[] = [`@claude ${args.intent}`, ""];
  if (args.contextHint) {
    parts.push("## Context for this change", "", args.contextHint, "");
  }
  parts.push(
    "## Ground rules (MacTech Suite cross-repo agent)",
    "",
    `- Branch prefix: \`${AGENT_BRANCH_PREFIX}\` (e.g. \`${AGENT_BRANCH_PREFIX}fix-health-route\`).`,
    `- Keep total lines of new/modified code under **${MAX_TOTAL_LINES_PER_PR}**. Split into multiple PRs if larger.`,
    `- **Do NOT modify**: lockfiles (\`package-lock.json\`, \`yarn.lock\`, \`pnpm-lock.yaml\`, \`bun.lockb\`), \`.env*\` files, \`.github/workflows/*\`, \`Dockerfile\`, \`railway.toml\`, \`nixpacks.toml\`, \`middleware.ts\`, any \`.pem\` / \`.key\` / \`.tf\` files.`,
    `- **Do NOT auto-merge.** Open the PR; a human at MacTech Solutions reviews and merges.`,
    `- Match the existing repo's framework conventions (Next.js \`app/\` vs \`pages/\`, file casing, lint config).`,
    `- Keep the PR description concise: what + why + how to verify.`,
    "",
  );
  if (args.extraRules) {
    parts.push("## Additional rules", "", args.extraRules, "");
  }
  parts.push(AGENT_PR_FOOTER.trim());
  return parts.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
