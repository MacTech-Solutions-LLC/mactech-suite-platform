/**
 * POST /api/webhooks/github
 *
 * Receives push / pull_request / workflow_run / check_run / release /
 * ping events from GitHub. HMAC-SHA256 verified against
 * GITHUB_WEBHOOK_SECRET via X-Hub-Signature-256. Returns 200 fast and
 * does the persistence work synchronously — payloads are small enough
 * that this is fine; if a future delivery shape grows we can move it
 * onto a queue.
 *
 * Security:
 *   - Body is read as raw bytes BEFORE JSON parse so HMAC verifies
 *     against the exact bytes GitHub signed.
 *   - Failures audit-log with reason + remote IP for forensics.
 *   - No secret material is ever stored. The full payload is
 *     persisted only after redactMetadata() in the IntegrationEvent
 *     row; commit-level rows store the file list + diff stats only.
 *
 * AgentOps note: webhook deliveries become the inputs that future
 * AgentOps capabilities (e.g. `summarize_repo_activity`) read off
 * GitCommitEvent / GitWorkflowRun. The webhook never executes a
 * capability itself.
 */

import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { writeAuditLog, redactMetadata } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { verifyGitHubSignature } from "@/lib/integrations/github/webhook-signature";
import { classifyChangedFiles } from "@/lib/integrations/github/risk-paths";
import { enableAutoMergeForPR } from "@/lib/integrations/github/auto-merge";
import {
  AGENT_BRANCH_PREFIX,
  isAllowlistedRepo,
} from "@/lib/agents/cross-repo/policy";
import { withInboundTrafficRecording } from "@/lib/services/command-center/traffic-service";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPPORTED_EVENTS = new Set([
  "ping",
  "push",
  "pull_request",
  "workflow_run",
  "check_run",
  "check_suite",
  "deployment",
  "deployment_status",
  "release",
]);

export async function POST(request: NextRequest) {
  return withInboundTrafficRecording(
    request,
    { sourceLabel: "github", endpoint: "/api/webhooks/github" },
    () => handleGitHubWebhook(request),
  );
}

async function handleGitHubWebhook(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event") ?? "";
  const delivery = request.headers.get("x-github-delivery") ?? "";

  // Read raw bytes (HMAC must verify against exact body).
  const rawBody = new Uint8Array(await request.arrayBuffer());

  const verify = verifyGitHubSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET);
  if (!verify.ok) {
    await writeAuditLog({
      eventType: "command_center.github.webhook_rejected",
      eventCategory: "security",
      severity: "warning",
      action: `GitHub webhook rejected: ${verify.reason}`,
      metadata: {
        reason: verify.reason,
        github_event: event,
        github_delivery: delivery,
        remote_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
    });
    return NextResponse.json(
      { ok: false, error: verify.reason },
      { status: verify.reason === "no_secret" ? 503 : 401 },
    );
  }

  if (!SUPPORTED_EVENTS.has(event)) {
    return NextResponse.json({ ok: true, ignored: true, event });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // ping is a one-shot connectivity check — log + 200.
  if (event === "ping") {
    await prisma.integrationEvent.create({
      data: {
        provider: "github",
        eventType: "ping",
        payloadJson: redactMetadata(payload as unknown) ?? {},
        processedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  }

  // Resolve the repo. Webhook payloads always carry repository.full_name.
  const fullName = readPath(payload, ["repository", "full_name"]);
  if (typeof fullName !== "string") {
    return NextResponse.json({ ok: false, error: "missing_repo" }, { status: 400 });
  }
  const [owner, repo] = fullName.split("/", 2);
  if (!owner || !repo) {
    return NextResponse.json({ ok: false, error: "bad_repo" }, { status: 400 });
  }

  // Upsert a GitRepository row for the webhook source. We don't fetch
  // metadata here — the periodic sync covers that. This is just so
  // commits/workflow-runs from a brand-new repo have an FK target.
  const repoRow = await prisma.gitRepository.upsert({
    where: { fullName },
    create: {
      owner,
      repo,
      fullName,
      provider: "github",
      defaultBranch:
        (readPath(payload, ["repository", "default_branch"]) as string | null) ?? "main",
      htmlUrl: (readPath(payload, ["repository", "html_url"]) as string | null) ?? null,
    },
    update: {},
  });

  let appRegistryId: string | null = null;
  // Best-effort association if any AppRegistry rows already mention
  // this repo. The Slice 1 seed populates repoFullName for every app.
  const linked = await prisma.appRegistry.findFirst({
    where: { repoFullName: fullName },
    select: { id: true },
  });
  if (linked) appRegistryId = linked.id;

  const eventRow = await prisma.integrationEvent.create({
    data: {
      provider: "github",
      eventType: event,
      eventAction:
        (readPath(payload, ["action"]) as string | null) ?? null,
      resourceType: event,
      resourceId: delivery || null,
      appRegistryId,
      severity: severityForEvent(event, payload),
      payloadJson: redactMetadata(payload as unknown) ?? {},
      processedAt: new Date(),
    },
  });

  // Per-event normalisation. Each branch is best-effort and never
  // throws to the caller — we already returned an event-was-received
  // 200, the body of work is just the side effects.
  try {
    if (event === "push") {
      await persistPushCommits(repoRow.id, payload);
    } else if (event === "workflow_run") {
      await persistWorkflowRunWebhook(repoRow.id, payload);
    } else if (event === "pull_request") {
      await maybeAutoMergeAgentPR(fullName, payload);
    }
  } catch (err) {
    await writeAuditLog({
      eventType: "command_center.github.webhook_processing_failed",
      eventCategory: "system",
      severity: "warning",
      action: `Failed to process ${event} for ${fullName}: ${err instanceof Error ? err.message : "unknown"}`,
      resourceType: "integration_event",
      resourceId: eventRow.id,
      metadata: { full_name: fullName, github_event: event },
    });
  }

  return NextResponse.json({ ok: true });
}

// ─── helpers ────────────────────────────────────────────────────────────

function readPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return null;
    }
  }
  return cur;
}

function severityForEvent(event: string, payload: Record<string, unknown>) {
  if (event === "workflow_run") {
    const c = readPath(payload, ["workflow_run", "conclusion"]);
    if (c === "failure" || c === "timed_out") return "high" as const;
  }
  if (event === "deployment_status") {
    const s = readPath(payload, ["deployment_status", "state"]);
    if (s === "failure" || s === "error") return "high" as const;
  }
  return "info" as const;
}

async function persistPushCommits(
  gitRepositoryId: string,
  payload: Record<string, unknown>,
) {
  const commits = readPath(payload, ["commits"]);
  if (!Array.isArray(commits)) return;
  const ref = (readPath(payload, ["ref"]) as string | null) ?? null;
  // ref looks like "refs/heads/main" — strip prefix
  const branch = ref?.replace(/^refs\/heads\//, "") ?? null;

  for (const c of commits) {
    if (!c || typeof c !== "object") continue;
    const sha = (readPath(c, ["id"]) as string | null) ?? null;
    if (!sha) continue;

    const added = (readPath(c, ["added"]) as string[] | null) ?? [];
    const modified = (readPath(c, ["modified"]) as string[] | null) ?? [];
    const removed = (readPath(c, ["removed"]) as string[] | null) ?? [];
    const files = [...added, ...modified, ...removed];
    const riskCategories = classifyChangedFiles(files);

    await prisma.gitCommitEvent.upsert({
      where: { gitRepositoryId_sha: { gitRepositoryId, sha } },
      create: {
        gitRepositoryId,
        sha,
        shortSha: sha.slice(0, 7),
        branch,
        authorName: (readPath(c, ["author", "name"]) as string | null) ?? null,
        authorEmail: (readPath(c, ["author", "email"]) as string | null) ?? null,
        authorLogin: (readPath(c, ["author", "username"]) as string | null) ?? null,
        message: ((readPath(c, ["message"]) as string | null) ?? "").slice(0, 8000),
        htmlUrl: (readPath(c, ["url"]) as string | null) ?? null,
        committedAt: parseDate(readPath(c, ["timestamp"])),
        pushedAt: new Date(),
        filesChanged: files.length,
        changedFilesJson: files as Prisma.InputJsonValue,
        riskFlagsJson: riskCategories as unknown as Prisma.InputJsonValue,
      },
      update: {
        // Webhook arrives before sync would; refresh fields on duplicate.
        branch,
        message: ((readPath(c, ["message"]) as string | null) ?? "").slice(0, 8000),
        committedAt: parseDate(readPath(c, ["timestamp"])),
        pushedAt: new Date(),
        filesChanged: files.length,
        changedFilesJson: files as Prisma.InputJsonValue,
        riskFlagsJson: riskCategories as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Refresh the repo's latestHeadSha if this push targets the default
  // branch. Cheap; bumps drift detection without waiting for the
  // periodic sync.
  const headSha = readPath(payload, ["after"]) as string | null;
  if (branch && headSha) {
    const repoRow = await prisma.gitRepository.findUnique({
      where: { id: gitRepositoryId },
      select: { defaultBranch: true },
    });
    if (repoRow?.defaultBranch === branch) {
      await prisma.gitRepository.update({
        where: { id: gitRepositoryId },
        data: {
          latestHeadSha: headSha,
          latestHeadShortSha: headSha.slice(0, 7),
          latestHeadCommittedAt: new Date(),
        },
      });
    }
  }
}

async function persistWorkflowRunWebhook(
  gitRepositoryId: string,
  payload: Record<string, unknown>,
) {
  const wr = readPath(payload, ["workflow_run"]);
  if (!wr || typeof wr !== "object") return;
  const id = readPath(wr, ["id"]);
  if (typeof id !== "number") return;

  const startedAt = parseDate(readPath(wr, ["run_started_at"]) ?? readPath(wr, ["created_at"]));
  const completedAt = parseDate(readPath(wr, ["updated_at"]));
  const durationMs =
    startedAt && completedAt && completedAt > startedAt
      ? completedAt.getTime() - startedAt.getTime()
      : null;

  const statusRaw = (readPath(wr, ["status"]) as string | null) ?? "unknown";
  const conclusionRaw = (readPath(wr, ["conclusion"]) as string | null) ?? null;

  await prisma.gitWorkflowRun.upsert({
    where: { githubRunId: BigInt(id) },
    create: {
      gitRepositoryId,
      githubRunId: BigInt(id),
      name: ((readPath(wr, ["name"]) as string | null) ?? "") || "workflow",
      event: (readPath(wr, ["event"]) as string | null) ?? "unknown",
      branch: (readPath(wr, ["head_branch"]) as string | null) ?? null,
      headSha: (readPath(wr, ["head_sha"]) as string | null) ?? "",
      status: normalizeStatus(statusRaw),
      conclusion: normalizeConclusion(conclusionRaw),
      htmlUrl: (readPath(wr, ["html_url"]) as string | null) ?? null,
      startedAt,
      completedAt,
      durationMs,
    },
    update: {
      status: normalizeStatus(statusRaw),
      conclusion: normalizeConclusion(conclusionRaw),
      htmlUrl: (readPath(wr, ["html_url"]) as string | null) ?? null,
      startedAt,
      completedAt,
      durationMs,
    },
  });
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(s: string) {
  if (s === "queued" || s === "in_progress" || s === "completed") return s;
  if (s === "waiting" || s === "requested" || s === "pending") return "queued" as const;
  return "unknown" as const;
}

function normalizeConclusion(c: string | null) {
  if (!c) return null;
  const ok = [
    "success",
    "failure",
    "cancelled",
    "skipped",
    "timed_out",
    "action_required",
    "neutral",
    "stale",
    "startup_failure",
  ] as const;
  return (ok as readonly string[]).includes(c) ? (c as (typeof ok)[number]) : null;
}

/**
 * Sprint 38: when a PR opens on a `mactech-agent/` branch in an
 * allowlisted repo, enable GitHub's native auto-merge so the
 * crash-fix flow lands without a human click. Class-of-action was
 * pre-approved when the operator filed the @claude issue from the
 * Suite's Crash Diagnose dialog.
 *
 * Strict gates:
 *   - action must be "opened" (not edited/synchronize/closed/etc.)
 *   - branch must start with the AGENT_BRANCH_PREFIX
 *   - repo must be in CROSS_REPO_ALLOWLIST
 *   - draft PRs are skipped (let the author finish before merging)
 *
 * If GitHub's auto-merge is disabled at the repo level, the helper
 * returns auto_merge_disabled_on_repo; we audit-log that distinctly
 * so the operator sees the actionable next step in /admin/audit-logs.
 */
async function maybeAutoMergeAgentPR(
  fullName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const action = readPath(payload, ["action"]);
  if (action !== "opened" && action !== "ready_for_review") return;

  const branch = readPath(payload, ["pull_request", "head", "ref"]) as
    | string
    | null;
  const number = readPath(payload, ["pull_request", "number"]) as number | null;
  const draft = readPath(payload, ["pull_request", "draft"]);
  if (!branch || typeof number !== "number") return;
  if (draft === true) return;
  if (!branch.startsWith(AGENT_BRANCH_PREFIX)) return;
  if (!isAllowlistedRepo(fullName)) return;

  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) return;

  const result = await enableAutoMergeForPR(owner, repo, number);

  await writeAuditLog({
    eventType: result.ok
      ? "command_center.auto_merge.enabled"
      : `command_center.auto_merge.${result.reason}`,
    eventCategory: "system",
    severity: result.ok
      ? "info"
      : result.reason === "auto_merge_disabled_on_repo"
        ? "warning"
        : "warning",
    action: result.ok
      ? `Enabled auto-merge on ${fullName}#${number} (mactech-agent crash-fix branch ${branch})`
      : `Auto-merge enable failed on ${fullName}#${number}: ${result.reason}${result.message ? ` — ${result.message}` : ""}`,
    resourceType: "github_pull_request",
    resourceId: `${fullName}#${number}`,
    metadata: {
      fullName,
      pullNumber: number,
      branch,
      ok: result.ok,
      reason: result.ok ? null : result.reason,
      message: result.ok ? null : result.message,
      sprint: "38",
    },
  });
}
