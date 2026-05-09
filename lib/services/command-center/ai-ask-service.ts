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

export type ContextKey =
  | "commit_intelligence"
  | "open_risks"
  | "ecosystem"
  | "deployment_drift"
  | "workflow_failures";

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
  }
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
  const commits = await prisma.gitCommitEvent.findMany({
    where: repoFilter ? { repo: { fullName: repoFilter } } : {},
    orderBy: { committedAt: "desc" },
    take: 100,
    include: { repo: { select: { fullName: true } } },
  });
  const lines = commits.map((c) => {
    const flags = Array.isArray(c.riskFlagsJson)
      ? (c.riskFlagsJson as string[]).join(",")
      : "";
    return `- ${c.repo?.fullName ?? "?"} ${c.shortSha} | ${c.authorName ?? "?"} | ${(c.message ?? "").split("\n")[0]}${
      flags ? ` [risk: ${flags}]` : ""
    }${c.committedAt ? ` (${c.committedAt.toISOString().slice(0, 10)})` : ""}`;
  });
  const header = `Commit intelligence — ${commits.length} most recent commit${
    commits.length === 1 ? "" : "s"
  }${repoFilter ? ` for ${repoFilter}` : " across linked repos"}.`;
  const text = `${header}\n\n${capLines(lines, opts.budget)}`;
  return { text, label: "commit intelligence" };
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

  const system = `You are an analyst for the MacTech Suite Command Center, a federal-grade operations console. Tone: direct, calm, executive-readable. No emoji. No marketing language. When you cite a fact, name the source line. If the user asks something the data doesn't answer, say so plainly. Output Markdown.`;
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

function renderTextBody(args: {
  contextKey: ContextKey;
  prompt: string;
  answer: string;
  requestedBy: string;
}): string {
  return `MacTech Suite Command Center
${labelForKey(args.contextKey)} — AI ask
Requested by: ${args.requestedBy}

QUESTION
${args.prompt}

ANSWER
${args.answer}

—
This email was triggered from the Command Center "Ask AI + send to team" affordance.
View live dashboard: https://www.suite.mactechsolutionsllc.com/${routeForKey(args.contextKey)}
`;
}

function renderHtmlBody(args: {
  contextKey: ContextKey;
  prompt: string;
  answer: string;
  requestedBy: string;
}): string {
  // Plain HTML, no framework. Keep it simple — most enterprise mail
  // clients butcher anything fancier than this.
  const escAnswer = escapeHtml(args.answer)
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; line-height: 1.5; color: #111; max-width: 720px; margin: 0 auto; padding: 24px;">
<div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #888;">MacTech Suite — ${escapeHtml(labelForKey(args.contextKey))}</div>
<h2 style="margin: 8px 0 4px; font-size: 18px;">AI ask</h2>
<div style="font-size: 12px; color: #666;">requested by ${escapeHtml(args.requestedBy)}</div>
<h3 style="margin-top: 24px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #444;">Question</h3>
<p style="margin: 4px 0;">${escapeHtml(args.prompt)}</p>
<h3 style="margin-top: 24px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #444;">Answer</h3>
<p>${escAnswer}</p>
<hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;">
<div style="font-size: 11px; color: #888;">Triggered from Command Center · <a href="https://www.suite.mactechsolutionsllc.com/${routeForKey(args.contextKey)}">View dashboard</a></div>
</body></html>`;
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
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailReady(): boolean {
  return emailConfigured();
}
