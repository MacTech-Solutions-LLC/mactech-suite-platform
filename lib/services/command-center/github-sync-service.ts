/**
 * GitHub repository sync. Pulls fresh repo metadata, the default-
 * branch HEAD, recent commits, and recent workflow runs into local
 * tables. Idempotent (writes are upsert / unique-keyed).
 *
 * AgentOps discipline:
 *   - Permission re-checked inside every state-changing public method.
 *   - All upserts and DB writes are idempotent on the keys declared
 *     in prisma/schema.prisma (GitCommitEvent unique on
 *     (gitRepositoryId, sha); GitWorkflowRun unique on githubRunId).
 *   - Writes to AuditLog go through lib/audit.ts so secrets are
 *     redacted in metadata.
 *   - The GitHub PAT never enters this file. We only call the
 *     client; the client owns the token.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  AuthorizationError,
  type CommandCenterAuthContext,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  getGitHubClient,
  type GitHubClient,
  type GitHubCommitDetail,
  type GitHubWorkflowRunSummary,
} from "@/lib/integrations/github/client";
import { classifyChangedFiles } from "@/lib/integrations/github/risk-paths";
import type {
  AppRegistry,
  GitRepository,
  Prisma,
  WorkflowConclusion,
  WorkflowStatus,
} from "@prisma/client";

const COMMIT_FETCH_DEPTH = 30;
const WORKFLOW_FETCH_DEPTH = 30;
/** Recent commits we drill into for full file lists + risk classification.
 *  Unbounded would burn rate limit; the rest are stored as summaries. */
const COMMITS_TO_DETAIL = 5;

export interface SyncRepositoryOutcome {
  repo: GitRepository;
  /** Number of commits inserted (not counting refreshes of existing rows). */
  commitsInserted: number;
  /** Number of workflow runs inserted or updated. */
  workflowRunsUpserted: number;
  /** Surfaced for UI banners + audit. */
  warnings: string[];
}

/** Public entrypoint: ensures permission, then delegates. */
export async function syncRepositoryByFullName(
  ctx: CommandCenterAuthContext,
  fullName: string,
): Promise<SyncRepositoryOutcome | null> {
  if (!ctx.permissions.includes(PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE)) {
    throw new AuthorizationError(
      "REPOSITORIES_MANAGE required to sync a repository.",
      "permission_denied",
    );
  }
  return syncRepositoryInternal(fullName, { triggeredByEmail: ctx.userProfile.email });
}

/** Internal entrypoint used by the reconciliation orchestrator. The
 *  orchestrator has already validated the cron secret OR the manual
 *  caller's permission, so we don't re-check here. */
export async function syncRepositoryInternal(
  fullName: string,
  opts: { triggeredByEmail?: string | null } = {},
): Promise<SyncRepositoryOutcome | null> {
  const client = getGitHubClient();
  if (!client.configured) return null;

  const [owner, repo] = fullName.split("/", 2);
  if (!owner || !repo) {
    throw new Error(`invalid repo full name: ${fullName}`);
  }

  // 1. Upsert the GitRepository row from the GitHub repo metadata.
  const repoOutcome = await client.getRepo(owner, repo);
  if (!repoOutcome.ok) {
    return persistSyncFailure(fullName, repoOutcome.reason, repoOutcome.status, opts);
  }
  const r = repoOutcome.data;

  // 2. Fetch the default-branch HEAD so the row carries latestHeadSha.
  const branchOutcome = await client.getBranchHead(r.owner, r.repo, r.defaultBranch);
  let latestHeadSha: string | null = null;
  let latestHeadCommittedAt: Date | null = null;
  if (branchOutcome.ok) {
    latestHeadSha = branchOutcome.data.sha;
    latestHeadCommittedAt = branchOutcome.data.committedAt
      ? new Date(branchOutcome.data.committedAt)
      : null;
  }

  // 3. Persist the GitRepository row.
  const stored = await prisma.gitRepository.upsert({
    where: { fullName: r.fullName },
    create: {
      owner: r.owner,
      repo: r.repo,
      fullName: r.fullName,
      htmlUrl: r.htmlUrl,
      defaultBranch: r.defaultBranch,
      visibility: r.visibility,
      provider: "github",
      active: !r.archived,
      latestHeadSha,
      latestHeadShortSha: latestHeadSha?.slice(0, 7) ?? null,
      latestHeadCommittedAt,
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
    update: {
      owner: r.owner,
      repo: r.repo,
      htmlUrl: r.htmlUrl,
      defaultBranch: r.defaultBranch,
      visibility: r.visibility,
      active: !r.archived,
      latestHeadSha,
      latestHeadShortSha: latestHeadSha?.slice(0, 7) ?? null,
      latestHeadCommittedAt,
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
  });

  const warnings: string[] = [];

  // 4. Fetch recent commits on the default branch + drill into the most
  //    recent N for files + risk classification.
  let commitsInserted = 0;
  const commitListing = await client.listRecentCommits(
    r.owner,
    r.repo,
    r.defaultBranch,
    COMMIT_FETCH_DEPTH,
  );
  if (commitListing.ok) {
    for (let i = 0; i < commitListing.data.length; i++) {
      const summary = commitListing.data[i];
      let detail: GitHubCommitDetail = summary;
      if (i < COMMITS_TO_DETAIL) {
        const detailRes = await client.getCommit(r.owner, r.repo, summary.sha);
        if (detailRes.ok) detail = detailRes.data;
      }
      const inserted = await upsertCommit(stored.id, r.defaultBranch, detail);
      if (inserted) commitsInserted++;
    }
  } else {
    warnings.push(`commit_listing_${commitListing.reason}`);
  }

  // 5. Workflow runs on default branch.
  let workflowRunsUpserted = 0;
  const runs = await client.listWorkflowRuns(r.owner, r.repo, r.defaultBranch, WORKFLOW_FETCH_DEPTH);
  if (runs.ok) {
    for (const run of runs.data) {
      await upsertWorkflowRun(stored.id, run);
      workflowRunsUpserted++;
    }
  } else {
    warnings.push(`workflow_listing_${runs.reason}`);
  }

  // 6. Refresh denorm counters on the repo row.
  await prisma.gitRepository.update({
    where: { id: stored.id },
    data: {
      recentCommitCount: commitsInserted,
      recentWorkflowCount: workflowRunsUpserted,
    },
  });

  await writeAuditLog({
    eventType: "command_center.github.repository_synced",
    eventCategory: "system",
    severity: warnings.length > 0 ? "warning" : "info",
    action: `Synced ${r.fullName}: +${commitsInserted} commits, ${workflowRunsUpserted} workflow runs${
      warnings.length > 0 ? ` (warnings: ${warnings.join(", ")})` : ""
    }`,
    actorEmail: opts.triggeredByEmail ?? null,
    resourceType: "git_repository",
    resourceId: stored.id,
    metadata: {
      full_name: r.fullName,
      default_branch: r.defaultBranch,
      latest_head_sha: latestHeadSha,
      commits_inserted: commitsInserted,
      workflow_runs_upserted: workflowRunsUpserted,
      warnings,
    },
  });

  return {
    repo: stored,
    commitsInserted,
    workflowRunsUpserted,
    warnings,
  };
}

/** Sync every active GitRepository the Suite tracks. Used by the
 *  reconciliation orchestrator. Fault-tolerant per repo. */
export async function syncAllRepositoriesForApps(
  triggeredByEmail: string | null,
): Promise<{
  reposAttempted: number;
  reposSucceeded: number;
  perRepoErrors: Array<{ fullName: string; error: string }>;
  totalCommitsInserted: number;
  totalWorkflowsUpserted: number;
}> {
  const client = getGitHubClient();
  if (!client.configured) {
    return {
      reposAttempted: 0,
      reposSucceeded: 0,
      perRepoErrors: [],
      totalCommitsInserted: 0,
      totalWorkflowsUpserted: 0,
    };
  }

  // Pull every distinct repo referenced by an active AppRegistry row.
  // We don't sync archived repos (the GitRepository.active flag is
  // managed by syncRepositoryInternal's archived check).
  const apps = await prisma.appRegistry.findMany({
    where: { status: "active", repoFullName: { not: null } },
    select: { repoFullName: true },
  });
  const fullNames = Array.from(
    new Set(apps.map((a) => a.repoFullName).filter((s): s is string => Boolean(s))),
  );

  const perRepoErrors: Array<{ fullName: string; error: string }> = [];
  let reposSucceeded = 0;
  let totalCommitsInserted = 0;
  let totalWorkflowsUpserted = 0;
  for (const fn of fullNames) {
    try {
      const result = await syncRepositoryInternal(fn, { triggeredByEmail });
      if (result) {
        reposSucceeded++;
        totalCommitsInserted += result.commitsInserted;
        totalWorkflowsUpserted += result.workflowRunsUpserted;
      }
    } catch (err) {
      perRepoErrors.push({
        fullName: fn,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return {
    reposAttempted: fullNames.length,
    reposSucceeded,
    perRepoErrors,
    totalCommitsInserted,
    totalWorkflowsUpserted,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────

async function persistSyncFailure(
  fullName: string,
  reason: string,
  status: number,
  opts: { triggeredByEmail?: string | null },
): Promise<null> {
  // Upsert a GitRepository row with the failure stamped. We try to
  // preserve the row even on auth failure so the operator can see the
  // gap on /admin/repositories.
  const [owner, repo] = fullName.split("/", 2);
  if (!owner || !repo) return null;

  await prisma.gitRepository.upsert({
    where: { fullName },
    create: {
      owner,
      repo,
      fullName,
      provider: "github",
      lastSyncedAt: new Date(),
      lastSyncError: `${reason}_${status}`,
    },
    update: {
      lastSyncedAt: new Date(),
      lastSyncError: `${reason}_${status}`,
    },
  });

  await writeAuditLog({
    eventType: "command_center.github.repository_sync_failed",
    eventCategory: "system",
    severity: reason === "unauthorized" ? "critical" : "warning",
    action: `Failed to sync ${fullName}: ${reason} (${status})`,
    actorEmail: opts.triggeredByEmail ?? null,
    resourceType: "git_repository",
    metadata: { full_name: fullName, reason, status },
  });
  return null;
}

/** Returns true if the row was newly inserted; false if it was an
 *  idempotent no-op (existing row). */
async function upsertCommit(
  gitRepositoryId: string,
  branch: string,
  detail: GitHubCommitDetail,
): Promise<boolean> {
  // Risk classification: pure function over the file list.
  const riskCategories = classifyChangedFiles(detail.files);

  const existing = await prisma.gitCommitEvent.findUnique({
    where: { gitRepositoryId_sha: { gitRepositoryId, sha: detail.sha } },
    select: { id: true },
  });

  await prisma.gitCommitEvent.upsert({
    where: { gitRepositoryId_sha: { gitRepositoryId, sha: detail.sha } },
    create: {
      gitRepositoryId,
      sha: detail.sha,
      shortSha: detail.shortSha,
      branch,
      authorName: detail.authorName,
      authorEmail: detail.authorEmail,
      authorLogin: detail.authorLogin,
      message: detail.message.slice(0, 8000),
      htmlUrl: detail.htmlUrl,
      committedAt: detail.committedAt ? new Date(detail.committedAt) : null,
      filesChanged: detail.filesChanged,
      additions: detail.additions,
      deletions: detail.deletions,
      changedFilesJson: detail.files as Prisma.InputJsonValue,
      riskFlagsJson: riskCategories as unknown as Prisma.InputJsonValue,
    },
    update: {
      authorName: detail.authorName,
      authorEmail: detail.authorEmail,
      authorLogin: detail.authorLogin,
      message: detail.message.slice(0, 8000),
      htmlUrl: detail.htmlUrl,
      committedAt: detail.committedAt ? new Date(detail.committedAt) : null,
      filesChanged: detail.filesChanged,
      additions: detail.additions,
      deletions: detail.deletions,
      changedFilesJson: detail.files as Prisma.InputJsonValue,
      riskFlagsJson: riskCategories as unknown as Prisma.InputJsonValue,
    },
  });
  return !existing;
}

async function upsertWorkflowRun(
  gitRepositoryId: string,
  run: GitHubWorkflowRunSummary,
): Promise<void> {
  const status = normalizeStatus(run.status);
  const conclusion = normalizeConclusion(run.conclusion);
  const startedAt = run.startedAt ? new Date(run.startedAt) : null;
  const completedAt = run.completedAt ? new Date(run.completedAt) : null;
  const durationMs =
    startedAt && completedAt && completedAt > startedAt
      ? completedAt.getTime() - startedAt.getTime()
      : null;

  await prisma.gitWorkflowRun.upsert({
    where: { githubRunId: BigInt(run.id) },
    create: {
      gitRepositoryId,
      githubRunId: BigInt(run.id),
      name: run.name,
      event: run.event,
      branch: run.branch,
      headSha: run.headSha,
      status,
      conclusion,
      htmlUrl: run.htmlUrl,
      startedAt,
      completedAt,
      durationMs,
    },
    update: {
      name: run.name,
      event: run.event,
      branch: run.branch,
      headSha: run.headSha,
      status,
      conclusion,
      htmlUrl: run.htmlUrl,
      startedAt,
      completedAt,
      durationMs,
    },
  });
}

function normalizeStatus(s: string): WorkflowStatus {
  switch (s) {
    case "queued":
    case "in_progress":
    case "completed":
      return s;
    case "waiting":
    case "requested":
    case "pending":
      return "queued";
    default:
      return "unknown";
  }
}

function normalizeConclusion(c: string | null): WorkflowConclusion | null {
  if (!c) return null;
  const allowed: WorkflowConclusion[] = [
    "success",
    "failure",
    "cancelled",
    "skipped",
    "timed_out",
    "action_required",
    "neutral",
    "stale",
    "startup_failure",
  ];
  return allowed.includes(c as WorkflowConclusion) ? (c as WorkflowConclusion) : null;
}

// Re-export GitHubClient interface for callers that want to inject a
// stub (e.g. webhook handler tests). Production code reads from
// getGitHubClient().
export type { GitHubClient };
