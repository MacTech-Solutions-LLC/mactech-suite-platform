/**
 * AI ask service — Slice 8.
 *
 * Generic "ask AI a question grounded in this dashboard's data" surface.
 * Reusable across pages (Commit Intelligence, Risk feed, Ecosystem,
 * Deployment) via a contextKey discriminator that chooses what data
 * to assemble as the LLM's knowledge base.
 *
 * Three concerns:
 *   1. Context assembly — pull whatever is relevant for the contextKey
 *      and stringify it cheaply (capped at ~16K chars to stay within
 *      reasonable token cost).
 *   2. LLM call — gpt-4o-mini, JSON-shaped is overkill for narrative
 *      output so we use plain text. Same OpenAI key + auto-traffic
 *      instrumentation as the planner.
 *   3. Optional email — when sendToTeam=true, render the answer to
 *      both text + a thin HTML wrapper, then dispatch via
 *      lib/integrations/email/client.ts.
 *
 * Permission: routes calling this MUST have already done their own
 * permission check; this service does not re-check.
 */

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { writeAuditLog } from "@/lib/audit";
import { sendTeamEmail, emailConfigured } from "@/lib/integrations/email/client";
import {
  renderEmailHtml,
  renderEmailText,
  type EmailTemplate,
} from "@/lib/integrations/email/template";

export type ContextKey =
  | "commit_intelligence"
  | "open_risks"
  | "ecosystem"
  | "deployment_drift"
  | "workflow_failures"
  | "today_digest";

/**
 * Sprint 42: per-contextKey analysis hints appended to the base
 * system prompt. The base says "be a calm analyst"; the hint says
 * "specifically for THIS data type, here's what good output looks
 * like and what NOT to do." Without these the model defaults to
 * paraphrasing the input back as a list, which is the failure mode
 * the user surfaced for commit emails (sprint 42 trigger).
 */
const SYSTEM_PROMPT_BASE = `You are an analyst for the MacTech Suite Command Center, a federal-grade operations console. Tone: direct, calm, executive-readable. No emoji. No marketing language. When you cite a fact, name the source line. If the user asks something the data doesn't answer, say so plainly. Output Markdown.`;

const COMMIT_INTELLIGENCE_HINT = `

CRITICAL — for this commit_intelligence context specifically:

The context block hands you signal-dense input: pre-computed path-prefix themes, hot files, risk-flagged commits called out in their own section, author distribution, AND per-commit detail (full body, files, +/- counts, risk flags). Your job is **analysis**, not enumeration. The user can read git log themselves.

GOOD shape:
- Lead with 1-2 sentences naming what shipped (or moved forward) overall.
- Group findings by **theme or impact area**, not by commit. If three commits across two repos all touched eligibility, that's one finding — say so.
- Call out every risk-flagged commit by name with a one-line "why it matters" assessment.
- Identify the load-bearing changes (large diffs, schema/auth/env touches, multi-file refactors, cross-repo coordination) and explain them.
- For per-app or per-repo sections, write **2-4 sentence narratives**, not bullet lists of commits. Synthesize.
- End with the "what's worth a closer look" — risks, large unreviewed surfaces, or work-in-progress that needs continuation.

BAD shape (this is what we're explicitly trying to NOT produce):
- A bullet list of "Commit: <sha> | <Feature/Fix>: <message first line>". The data already contains all that — your job is to *read across* it.
- Repeating the path-prefix themes table back without interpreting it.
- Ending sections with "Great progress!" or "The team shipped fast." Name what shipped.
- Starting paragraphs with "**Commit:**" headings or sha-as-headline.
- Any output where deleting the dates and shas leaves you unable to tell which commit did what — meaning the analysis was attached to commits, not to *changes*.`;

const CONTEXT_ANALYSIS_HINTS: Partial<Record<ContextKey, string>> = {
  commit_intelligence: COMMIT_INTELLIGENCE_HINT,
};

export interface AskInput {
  contextKey: ContextKey;
  prompt: string;
  /** When true, email the answer to recipients (defaults to TEAM_EMAILS env). */
  sendToTeam?: boolean;
  /** Override recipients. When unset and sendToTeam is true, uses TEAM_EMAILS. */
  recipients?: string[];
  /** Optional appKey filter for context-keys that benefit from scoping. */
  appKey?: string;
  /** Audit-trail attribution (route layer fills these from session). */
  actorClerkUserId: string;
  actorEmail: string;
}

export interface AskResult {
  ok: boolean;
  /** The narrative the LLM produced. */
  answer: string;
  /** How many tokens (chars proxy) the assembled context contained. */
  contextChars: number;
  /** Whether the LLM call actually went out (vs deterministic fallback). */
  llmAvailable: boolean;
  email?: {
    attempted: boolean;
    sent: boolean;
    skippedReason?: string;
    recipients: string[];
    messageId?: string;
    error?: string;
  };
}

const CONTEXT_CHAR_BUDGET = 16_000;

export async function ask(input: AskInput): Promise<AskResult> {
  // 1. Assemble context.
  const context = await assembleContext(input.contextKey, {
    appKey: input.appKey,
    budget: CONTEXT_CHAR_BUDGET,
  });

  // 2. Call the LLM (or deterministic fallback if unset).
  const { answer, llmAvailable } = await runAsk({
    contextKey: input.contextKey,
    prompt: input.prompt,
    contextString: context.text,
  });

  // 3. Optional email.
  let email: AskResult["email"];
  if (input.sendToTeam) {
    const recipients = input.recipients ?? env.TEAM_EMAILS;
    const subject = renderSubject(input.contextKey, input.prompt);
    const text = renderTextBody({
      contextKey: input.contextKey,
      prompt: input.prompt,
      answer,
      requestedBy: input.actorEmail,
    });
    const html = renderHtmlBody({
      contextKey: input.contextKey,
      prompt: input.prompt,
      answer,
      requestedBy: input.actorEmail,
    });
    const sendResult = await sendTeamEmail({
      to: recipients,
      subject,
      text,
      html,
    });
    email = {
      attempted: true,
      sent: sendResult.ok,
      skippedReason: sendResult.skippedReason,
      recipients,
      messageId: sendResult.messageId,
      error: sendResult.error,
    };
  }

  // 4. Audit row — every ask lands here so an assessor can replay
  //    "who asked the AI what" without joining other tables.
  await writeAuditLog({
    eventType: "command_center.ai.asked",
    eventCategory: "system",
    action: `AI ask (${input.contextKey}): ${input.prompt.slice(0, 120)}`,
    actorClerkUserId: input.actorClerkUserId,
    actorEmail: input.actorEmail,
    resourceType: "ai_ask",
    metadata: {
      contextKey: input.contextKey,
      contextChars: context.text.length,
      promptLength: input.prompt.length,
      answerLength: answer.length,
      llmAvailable,
      sendToTeam: Boolean(input.sendToTeam),
      emailSent: email?.sent ?? null,
    },
  });

  return {
    ok: true,
    answer,
    contextChars: context.text.length,
    llmAvailable,
    email,
  };
}

// ─── Context assembly ────────────────────────────────────────────────────

interface ContextAssembly {
  text: string;
  /** Short label embedded in the system prompt so the LLM knows what
   *  it's looking at. */
  label: string;
}

async function assembleContext(
  key: ContextKey,
  opts: { appKey?: string; budget: number },
): Promise<ContextAssembly> {
  switch (key) {
    case "commit_intelligence":
      return assembleCommitIntelligence(opts);
    case "open_risks":
      return assembleOpenRisks(opts);
    case "ecosystem":
      return assembleEcosystem(opts);
    case "deployment_drift":
      return assembleDeploymentDrift(opts);
    case "workflow_failures":
      return assembleWorkflowFailures(opts);
    case "today_digest":
      return assembleTodayDigest(opts);
  }
}

async function assembleTodayDigest(opts: { budget: number }): Promise<ContextAssembly> {
  const { getTodayDigest } = await import("./today-digest-service");
  const d = await getTodayDigest();
  const lines: string[] = [];
  lines.push(`Last ${d.windowHours}h across the MacTech ecosystem.`);
  lines.push("");
  lines.push("CRITICAL RIGHT NOW");
  lines.push(
    `- ${d.criticalNow.openCriticalRisks} open critical-severity risk(s)`,
  );
  lines.push(`- ${d.criticalNow.appsCurrentlyDown} app(s) reporting health=down`);
  lines.push(
    `- ${d.criticalNow.failedDeployments24h} failed/crashed deploy(s) (24h)`,
  );
  lines.push(
    `- ${d.criticalNow.refusedAgentRuns24h} agent run(s) refused by IBE (24h)`,
  );
  lines.push(`- ${d.criticalNow.awaitingApproval} agent run(s) awaiting approval`);
  lines.push("");
  if (d.deploys.length > 0) {
    lines.push(`DEPLOYS (${d.deploys.length})`);
    for (const x of d.deploys) {
      lines.push(
        `- ${x.appName ?? x.appKey ?? "?"} | ${x.railwayStatus} | drift=${x.productionDriftStatus} | ${x.liveCommitShortSha ?? "?"} | ${x.checkedAt.toISOString().slice(0, 16)}`,
      );
    }
    lines.push("");
  }
  if (d.commits.length > 0) {
    lines.push(`COMMITS (${d.commits.length})`);
    for (const c of d.commits) {
      const flags = c.riskFlags.length > 0 ? ` [risk: ${c.riskFlags.join(",")}]` : "";
      lines.push(
        `- ${c.repoFullName} ${c.shortSha} | ${c.authorName ?? "?"} | ${c.message.split("\n")[0]}${flags}`,
      );
    }
    lines.push("");
  }
  if (d.failedWorkflows.length > 0) {
    lines.push(`FAILED WORKFLOWS (${d.failedWorkflows.length})`);
    for (const w of d.failedWorkflows) {
      lines.push(`- ${w.repoFullName} | ${w.name} | ${w.conclusion}`);
    }
    lines.push("");
  }
  if (d.risksOpened.length > 0) {
    lines.push(`RISKS OPENED (${d.risksOpened.length})`);
    for (const r of d.risksOpened) {
      lines.push(
        `- [${r.severity}] ${r.appName ?? r.appKey ?? "?"} / ${r.category} — ${r.title}`,
      );
    }
    lines.push("");
  }
  if (d.risksResolved.length > 0) {
    lines.push(`RISKS RESOLVED (${d.risksResolved.length})`);
    for (const r of d.risksResolved) {
      lines.push(
        `- [${r.severity}] ${r.appName ?? r.appKey ?? "?"} / ${r.category} — ${r.title}`,
      );
    }
    lines.push("");
  }
  if (d.agentRuns.length > 0) {
    lines.push(`AGENT RUNS (${d.agentRuns.length})`);
    for (const a of d.agentRuns) {
      const trigger = a.triggeredByApiKeyName
        ? `via ${a.triggeredByApiKeyName}`
        : `by ${a.requestedByEmail}`;
      lines.push(
        `- ${a.status.toUpperCase()} | ${a.plannedStepCount} step(s) | ${trigger} | ${a.requestText.slice(0, 80)}`,
      );
    }
    lines.push("");
  }
  if (d.trafficErrors.length > 0) {
    lines.push(`TRAFFIC ERRORS (top ${d.trafficErrors.length} pairs)`);
    for (const t of d.trafficErrors) {
      const pct = t.callCount > 0 ? Math.round((t.errorCount / t.callCount) * 100) : 0;
      lines.push(
        `- ${t.sourceLabel} → ${t.targetLabel} | ${t.errorCount}/${t.callCount} errors (${pct}%)`,
      );
    }
    lines.push("");
  }
  return {
    text: capLines(lines, opts.budget),
    label: "today's ecosystem digest",
  };
}

async function assembleCommitIntelligence(opts: {
  appKey?: string;
  budget: number;
}): Promise<ContextAssembly> {
  const repoFilter = opts.appKey
    ? await prisma.appRegistry
        .findUnique({ where: { appKey: opts.appKey }, select: { repoFullName: true } })
        .then((a) => a?.repoFullName ?? null)
    : null;
  // Sprint 42: pull the structured signal the prior assembler hid.
  // file paths via changedFilesJson, full bodies, +/- counts, app
  // bindings via repo→appLink. The model gets actual analysis input,
  // not a flat git-log dump.
  const commits = await prisma.gitCommitEvent.findMany({
    where: repoFilter ? { repo: { fullName: repoFilter } } : {},
    orderBy: { committedAt: "desc" },
    take: 80,
    include: {
      repo: {
        select: {
          fullName: true,
          appLinks: {
            select: {
              app: {
                select: { appKey: true, name: true, criticality: true },
              },
            },
          },
        },
      },
    },
  });

  // Pre-compute signals so the model sees synthesis-ready summaries
  // instead of having to derive them from row-by-row prose.
  const byRepo = new Map<string, typeof commits>();
  const fileCounts = new Map<string, number>();
  const themePrefixes = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  const riskFlagged: typeof commits = [];
  let totalAdds = 0;
  let totalDels = 0;
  let totalFiles = 0;

  for (const c of commits) {
    const repoFull = c.repo?.fullName ?? "unknown";
    const bucket = byRepo.get(repoFull) ?? [];
    bucket.push(c);
    byRepo.set(repoFull, bucket);

    totalAdds += c.additions;
    totalDels += c.deletions;
    totalFiles += c.filesChanged;

    const files = Array.isArray(c.changedFilesJson)
      ? (c.changedFilesJson as string[])
      : [];
    for (const f of files) {
      fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
      // Path-prefix theme: first 1-2 segments. Catches the common
      // "this whole change touched lib/services/auth/" pattern.
      const parts = f.split("/");
      if (parts.length >= 2) {
        const prefix = parts.slice(0, 2).join("/");
        themePrefixes.set(prefix, (themePrefixes.get(prefix) ?? 0) + 1);
      }
    }
    if (c.authorName) {
      authorCounts.set(c.authorName, (authorCounts.get(c.authorName) ?? 0) + 1);
    }
    if (Array.isArray(c.riskFlagsJson) && (c.riskFlagsJson as string[]).length > 0) {
      riskFlagged.push(c);
    }
  }

  const lines: string[] = [];
  lines.push(`# Commit intelligence — ANALYSIS INPUT`);
  lines.push(
    `Window: ${commits.length} commit${commits.length === 1 ? "" : "s"} across ${byRepo.size} repo(s)${repoFilter ? ` (filtered to ${repoFilter})` : ""}.`,
  );
  lines.push(
    `Aggregate diff: +${totalAdds.toLocaleString()} / -${totalDels.toLocaleString()} across ${totalFiles} file change${totalFiles === 1 ? "" : "s"}.`,
  );
  lines.push("");

  // Path-prefix themes — drives the "what topic did the team work on
  // this week" question. We only emit prefixes hit by ≥2 commits to
  // avoid a long-tail wall of one-off paths.
  const topThemes = Array.from(themePrefixes.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  if (topThemes.length > 0) {
    lines.push(`## Path-prefix themes (≥2 commits)`);
    lines.push(`These are clusters worth grouping in your narrative:`);
    for (const [p, n] of topThemes) {
      lines.push(`- \`${p}/\` — ${n} commit(s) touched files under this prefix`);
    }
    lines.push("");
  }

  // Hot files — surfaces the load-bearing change targets.
  const hotFiles = Array.from(fileCounts.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (hotFiles.length > 0) {
    lines.push(`## Hot files (touched ≥2 times)`);
    for (const [f, n] of hotFiles) lines.push(`- \`${f}\` — ${n}×`);
    lines.push("");
  }

  // Risk-flagged commits as a separate section so the model can't
  // miss them in the per-repo deep-dive.
  if (riskFlagged.length > 0) {
    lines.push(
      `## ⚠ Risk-flagged commits (${riskFlagged.length}) — call these out by name in your analysis`,
    );
    for (const c of riskFlagged) {
      const flags = (c.riskFlagsJson as string[]).join(", ");
      const headline = (c.message ?? "").split("\n")[0]!.slice(0, 140);
      lines.push(
        `- \`${c.repo?.fullName}@${c.shortSha}\` [${flags}] — ${headline}`,
      );
    }
    lines.push("");
  }

  // Author distribution.
  const topAuthors = Array.from(authorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (topAuthors.length > 0) {
    lines.push(`## Authors in window`);
    for (const [a, n] of topAuthors) lines.push(`- ${a}: ${n} commit(s)`);
    lines.push("");
  }

  // Per-repo dive. Capped per-repo so a single chatty repo can't
  // crowd out the rest of the picture.
  lines.push(`## Per-repo detail`);
  lines.push("");
  // Sort repos by total commits desc so the loudest repo lands first.
  const sortedRepos = Array.from(byRepo.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [repoFull, repoCommits] of sortedRepos) {
    const apps = repoCommits[0]?.repo?.appLinks?.map((l) => l.app) ?? [];
    const appBadge =
      apps.length > 0
        ? ` → app: ${apps.map((a) => `${a.appKey} (${a.criticality})`).join(", ")}`
        : "";
    lines.push(`### ${repoFull}${appBadge}`);
    lines.push(
      `${repoCommits.length} commit(s) in window. Newest first.`,
    );
    lines.push("");
    for (const c of repoCommits.slice(0, 12)) {
      const flags = Array.isArray(c.riskFlagsJson)
        ? (c.riskFlagsJson as string[])
        : [];
      const files = Array.isArray(c.changedFilesJson)
        ? (c.changedFilesJson as string[])
        : [];
      const date = c.committedAt?.toISOString().slice(0, 10) ?? "?";
      lines.push(
        `**${c.shortSha}** · ${c.authorName ?? "?"} · ${date}${
          flags.length > 0 ? ` · ⚠ ${flags.join(", ")}` : ""
        }`,
      );
      // Full message body, not just first line. Trim to keep budget
      // sane but expose the body in case the author wrote context.
      lines.push((c.message ?? "").trim().slice(0, 600));
      lines.push(
        `→ +${c.additions}/-${c.deletions} across ${c.filesChanged} file(s)`,
      );
      if (files.length > 0) {
        const head = files.slice(0, 8);
        const tail = files.length > 8 ? ` … (+${files.length - 8} more)` : "";
        lines.push(`Files: ${head.map((f) => `\`${f}\``).join(", ")}${tail}`);
      }
      lines.push("");
    }
    if (repoCommits.length > 12) {
      lines.push(
        `_…${repoCommits.length - 12} additional commit(s) in this repo, omitted to fit context budget._`,
      );
      lines.push("");
    }
  }

  return {
    text: capLines(lines, opts.budget),
    label: "commit intelligence (analysis-ready)",
  };
}

async function assembleOpenRisks(opts: { budget: number }): Promise<ContextAssembly> {
  const flags = await prisma.operationalRiskFlag.findMany({
    where: { status: "open" },
    orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
    take: 100,
    include: { app: { select: { appKey: true, name: true } } },
  });
  const lines = flags.map(
    (f) =>
      `- [${f.severity}] ${f.app?.name ?? "?"} / ${f.category} — ${f.title}${
        f.description ? ` :: ${f.description.slice(0, 200)}` : ""
      }${f.acknowledgedBy ? ` (acked by ${f.acknowledgedBy})` : ""}`,
  );
  const text = `${flags.length} open operational risk flag${
    flags.length === 1 ? "" : "s"
  }.\n\n${capLines(lines, opts.budget)}`;
  return { text, label: "open risk feed" };
}

async function assembleEcosystem(opts: { budget: number }): Promise<ContextAssembly> {
  const apps = await prisma.appRegistry.findMany({
    where: { status: "active" },
    select: {
      appKey: true,
      name: true,
      criticality: true,
      lifecycle: true,
      repoFullName: true,
      publicUrl: true,
      healthSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { status: true, checkedAt: true },
      },
      riskFlags: { where: { status: "open" }, select: { severity: true } },
    },
  });
  const deps = await prisma.appDependency.findMany({
    include: {
      source: { select: { appKey: true } },
      target: { select: { appKey: true } },
    },
  });
  const appLines = apps.map((a) => {
    const h = a.healthSnapshots[0];
    const risks = a.riskFlags.length;
    return `- ${a.appKey} (${a.name}) ${a.criticality} ${a.lifecycle} | health=${h?.status ?? "unknown"} | risks=${risks}${
      a.repoFullName ? ` | repo=${a.repoFullName}` : ""
    }`;
  });
  const depLines = deps.map(
    (d) => `- ${d.source.appKey} → ${d.target.appKey} : ${d.dependencyType} (${d.criticality})`,
  );
  const text = `Ecosystem snapshot.\n\nApps (${apps.length}):\n${appLines.join("\n")}\n\nDependencies (${deps.length}):\n${capLines(depLines, opts.budget - 2000)}`;
  return { text: text.slice(0, opts.budget), label: "ecosystem map" };
}

async function assembleDeploymentDrift(opts: { budget: number }): Promise<ContextAssembly> {
  const snaps = await prisma.deploymentSnapshot.findMany({
    where: { productionDriftStatus: { not: "in_sync" } },
    orderBy: { checkedAt: "desc" },
    take: 80,
    include: { app: { select: { appKey: true, name: true } } },
  });
  const lines = snaps.map(
    (s) =>
      `- ${s.app?.name ?? "?"} (${s.app?.appKey ?? "?"}) | drift=${s.productionDriftStatus} | behind=${
        s.commitsBehind ?? "?"
      } | live=${s.liveCommitShortSha ?? "?"} | head=${s.githubHeadShortSha ?? "?"} | ${s.checkedAt.toISOString().slice(0, 16)}`,
  );
  const text = `${snaps.length} deployment(s) drifted from main.\n\n${capLines(lines, opts.budget)}`;
  return { text, label: "deployment drift" };
}

async function assembleWorkflowFailures(opts: { budget: number }): Promise<ContextAssembly> {
  const runs = await prisma.gitWorkflowRun.findMany({
    where: { conclusion: { in: ["failure", "timed_out", "startup_failure"] } },
    orderBy: { startedAt: "desc" },
    take: 80,
    include: { repo: { select: { fullName: true } } },
  });
  const lines = runs.map(
    (r) =>
      `- ${r.repo?.fullName ?? "?"} | ${r.name} | ${r.conclusion} | ${
        r.startedAt ? r.startedAt.toISOString().slice(0, 16) : "—"
      }${r.htmlUrl ? ` | ${r.htmlUrl}` : ""}`,
  );
  const text = `${runs.length} failing workflow run${
    runs.length === 1 ? "" : "s"
  }.\n\n${capLines(lines, opts.budget)}`;
  return { text, label: "workflow failures" };
}

function capLines(lines: string[], budget: number): string {
  let out = "";
  for (const l of lines) {
    if (out.length + l.length + 1 > budget) {
      out += `\n[… truncated ${lines.length - out.split("\n").length} more line(s) for token budget]`;
      break;
    }
    out += `${l}\n`;
  }
  return out.trim();
}

// ─── LLM call ────────────────────────────────────────────────────────────

async function runAsk(args: {
  contextKey: ContextKey;
  prompt: string;
  contextString: string;
}): Promise<{ answer: string; llmAvailable: boolean }> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey || !env.ENABLE_AI_SUMMARIES) {
    // Deterministic fallback — return the user's prompt + a note that
    // we couldn't reach an LLM. Keeps the page responsive even when
    // OPENAI_API_KEY is unset.
    return {
      answer: `[AI summarization is currently disabled. Set ENABLE_AI_SUMMARIES=true and OPENAI_API_KEY in env to activate.]\n\nYou asked: ${args.prompt}\n\nThe ${args.contextKey.replace(/_/g, " ")} context contained ${args.contextString.length.toLocaleString()} chars of data.`,
      llmAvailable: false,
    };
  }

  const system =
    SYSTEM_PROMPT_BASE +
    (CONTEXT_ANALYSIS_HINTS[args.contextKey] ?? "");
  const user = `Context (${args.contextKey}):\n\n${args.contextString}\n\n---\n\nUser question: ${args.prompt}`;

  const reqBody = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const startedAt = Date.now();
  let statusForTraffic = 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: reqBody,
      signal: controller.signal,
    });
    statusForTraffic = resp.status;
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return {
        answer: `[AI call failed: HTTP ${resp.status}. ${errText.slice(0, 200)}]`,
        llmAvailable: false,
      };
    }
    const body = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = body.choices?.[0]?.message?.content ?? "[AI returned no content.]";
    return { answer, llmAvailable: true };
  } catch (err) {
    return {
      answer: `[AI call errored: ${err instanceof Error ? err.message : "unknown"}.]`,
      llmAvailable: false,
    };
  } finally {
    clearTimeout(timeout);
    try {
      const { recordOutboundCall } = await import("./traffic-service");
      void recordOutboundCall({
        targetLabel: "openai",
        endpoint: "openai:/v1/chat/completions:ai-ask",
        method: "POST",
        statusCode: statusForTraffic || 0,
        bytesOut: reqBody.length,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      /* never blocks */
    }
  }
}

// ─── Email rendering ─────────────────────────────────────────────────────

function renderSubject(contextKey: ContextKey, prompt: string): string {
  const tag = labelForKey(contextKey);
  const trimmed = prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
  return `[Suite · ${tag}] ${trimmed}`;
}

/**
 * Slice 8.2: ai-ask emails now go through the shared template helper
 * (lib/integrations/email/template.ts). Same gorgeous shape every
 * Suite email uses — dark hero card on top, white content body,
 * primary CTA button to the live dashboard, brand footer.
 */
function buildEmailTemplate(args: {
  contextKey: ContextKey;
  prompt: string;
  answer: string;
  requestedBy: string;
}): EmailTemplate {
  const dashboardLabel = labelForKey(args.contextKey);
  const dashboardUrl = `https://www.suite.mactechsolutionsllc.com/${routeForKey(args.contextKey)}`;
  return {
    heroEyebrow: `MacTech Suite · ${dashboardLabel}`,
    heroTitle: "AI ask",
    heroSubtitle: `Requested by **${args.requestedBy}** · ${new Date().toUTCString()}`,
    sections: [
      { heading: "Question", body: args.prompt },
      { heading: "Answer", body: args.answer },
    ],
    cta: { label: `Open ${dashboardLabel} dashboard →`, href: dashboardUrl },
    footer:
      'Triggered from the Command Center "Ask AI + send to team" affordance. Reply to this email — it routes to the requesting operator.',
  };
}

function renderTextBody(args: {
  contextKey: ContextKey;
  prompt: string;
  answer: string;
  requestedBy: string;
}): string {
  return renderEmailText(buildEmailTemplate(args));
}

function renderHtmlBody(args: {
  contextKey: ContextKey;
  prompt: string;
  answer: string;
  requestedBy: string;
}): string {
  return renderEmailHtml(buildEmailTemplate(args));
}

function labelForKey(key: ContextKey): string {
  switch (key) {
    case "commit_intelligence":
      return "Commit Intelligence";
    case "open_risks":
      return "Open Risks";
    case "ecosystem":
      return "Ecosystem";
    case "deployment_drift":
      return "Deployment Drift";
    case "workflow_failures":
      return "Workflow Failures";
    case "today_digest":
      return "Today";
  }
}

function routeForKey(key: ContextKey): string {
  switch (key) {
    case "commit_intelligence":
      return "admin/repositories/commits";
    case "open_risks":
      return "admin/ops/risk";
    case "ecosystem":
      return "admin/ops/ecosystem";
    case "deployment_drift":
      return "admin/repositories/workflow-runs";
    case "workflow_failures":
      return "admin/repositories/workflow-runs";
    case "today_digest":
      return "command-center";
  }
}

export function emailReady(): boolean {
  return emailConfigured();
}
