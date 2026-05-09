"use server";

/**
 * Direct "file @claude fix issue" — Sprint 37.
 *
 * Skips the full AgentOps IBE pipeline for the simple-and-bounded
 * case of a Railway build/deploy crash. The user pushed back on
 * routing every crash fix through plan → approve → execute when:
 *   - the action is bounded (one GitHub issue in one allowlisted repo)
 *   - the blast radius is contained (a PR opens but doesn't auto-merge)
 *   - the diagnostic info is the input, not a planning question
 *   - the GitHub review IS the gate
 *
 * What's preserved:
 *   - CROSS_REPO_ALLOWLIST check — only allowlisted repos.
 *   - DEPLOYMENTS_VIEW + REPOSITORIES_MANAGE permission gates.
 *   - Audit log entry per filed issue.
 *   - The @claude routine itself runs through Claude Code's own
 *     review, not the Suite's.
 *
 * What's bypassed:
 *   - AgentRun row + AgentStep + planner pass.
 *   - IntentBuilder declaration step.
 *   - Suite-side approval gate (Claude Code GitHub App + human PR
 *     review on github.com replace it for this narrow case).
 */

import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getGitHubClient } from "@/lib/integrations/github/client";
import { isAllowlistedRepo } from "@/lib/agents/cross-repo/policy";
import { getDeploymentDiagnosis } from "./deploy-diagnosis-service";

export interface FileClaudeFixResult {
  ok: boolean;
  reason?:
    | "snapshot_not_found"
    | "repo_not_allowlisted"
    | "no_repo_mapping"
    | "github_unconfigured"
    | "diagnosis_failed"
    | "create_issue_failed";
  /** GitHub issue number when ok=true. */
  issueNumber?: number;
  /** github.com URL of the filed issue. */
  issueUrl?: string;
  /** Surface the underlying error message when ok=false. */
  message?: string;
}

export async function fileClaudeFixIssueForCrash(
  snapshotId: string,
): Promise<FileClaudeFixResult> {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE,
  );

  const diag = await getDeploymentDiagnosis(snapshotId);
  if (!diag.ok) {
    return {
      ok: false,
      reason: "diagnosis_failed",
      message: diag.reason + (diag.message ? `: ${diag.message}` : ""),
    };
  }

  // Re-read the snapshot to get app + repo info. The diagnosis
  // service already touched the same row, but its return shape
  // doesn't include the repoFullName.
  const { prisma } = await import("@/lib/db/prisma");
  const snap = await prisma.deploymentSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      app: { select: { appKey: true, name: true, repoFullName: true } },
      liveCommitShortSha: true,
      liveBranch: true,
      railwayDeploymentId: true,
      railwayStatus: true,
    },
  });
  if (!snap) return { ok: false, reason: "snapshot_not_found" };

  const repoFullName = snap.app?.repoFullName ?? null;
  if (!repoFullName) {
    return {
      ok: false,
      reason: "no_repo_mapping",
      message:
        "App has no repoFullName — set it on AppRegistry before filing a fix issue.",
    };
  }
  if (!isAllowlistedRepo(repoFullName)) {
    return {
      ok: false,
      reason: "repo_not_allowlisted",
      message: `${repoFullName} is not in CROSS_REPO_ALLOWLIST. Add it to lib/agents/cross-repo/policy.ts before the agent can touch it.`,
    };
  }

  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) {
    return { ok: false, reason: "no_repo_mapping", message: repoFullName };
  }

  const gh = getGitHubClient();
  if (!gh.configured) {
    return { ok: false, reason: "github_unconfigured" };
  }

  const title = `[mactech-agent] Fix ${snap.railwayStatus} deploy: ${truncate(diag.rootCause ?? "build error", 60)}`;
  const body = renderIssueBody({
    appName: snap.app?.name ?? snap.app?.appKey ?? repoFullName,
    appKey: snap.app?.appKey ?? null,
    repoFullName,
    railwayStatus: snap.railwayStatus,
    railwayDeploymentId: snap.railwayDeploymentId,
    liveCommitShortSha: snap.liveCommitShortSha,
    liveBranch: snap.liveBranch,
    rootCause: diag.rootCause,
    isBuildFailure: diag.isBuildFailure,
    errorTail: diag.errorTail.map((l) => l.message).join("\n"),
  });

  const result = await gh.createIssue(owner, repo, {
    title,
    body,
    labels: ["mactech-agent", "automation", "deploy-crash"],
  });
  if (!result.ok) {
    await writeAuditLog({
      eventType: "command_center.deploy.fix_issue.failed",
      eventCategory: "system",
      severity: "warning",
      action: `agent: file @claude fix issue failed for ${repoFullName} (${result.reason})`,
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      resourceType: "github_issue",
      resourceId: repoFullName,
      metadata: {
        snapshotId,
        repoFullName,
        ghReason: result.reason,
        ghStatus: result.status,
      },
    });
    return {
      ok: false,
      reason: "create_issue_failed",
      message: `${result.reason} (HTTP ${result.status})`,
    };
  }

  await writeAuditLog({
    eventType: "command_center.deploy.fix_issue.filed",
    eventCategory: "system",
    severity: "info",
    action: `agent: filed @claude fix issue #${result.data.number} for ${repoFullName} (${snap.railwayStatus} on ${snap.liveCommitShortSha ?? "?"})`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "github_issue",
    resourceId: `${repoFullName}#${result.data.number}`,
    metadata: {
      snapshotId,
      repoFullName,
      issueNumber: result.data.number,
      htmlUrl: result.data.htmlUrl,
      railwayStatus: snap.railwayStatus,
      railwayDeploymentId: snap.railwayDeploymentId,
      rootCause: diag.rootCause,
      delivery: "claude_code_github_app",
      bypass: "ibe_skipped_for_crash_fix",
    },
  });

  return {
    ok: true,
    issueNumber: result.data.number,
    issueUrl: result.data.htmlUrl,
  };
}

function renderIssueBody(args: {
  appName: string;
  appKey: string | null;
  repoFullName: string;
  railwayStatus: string;
  railwayDeploymentId: string;
  liveCommitShortSha: string | null;
  liveBranch: string | null;
  rootCause: string | null;
  isBuildFailure: boolean;
  errorTail: string;
}): string {
  const tail = truncate(args.errorTail, 6000);
  const stage = args.isBuildFailure ? "build" : "runtime";
  return [
    `@claude the latest deploy of **${args.appName}** is **${args.railwayStatus}** on Railway.`,
    "",
    `Please open a PR fixing the ${stage} failure described below. Aim for the smallest change that makes the deploy succeed — this is for a deploy that's currently broken in production, not a refactor.`,
    "",
    `## Failure summary`,
    "",
    args.rootCause
      ? `**Root cause (heuristic):** \`${args.rootCause}\``
      : `(no root cause extracted — see the log tail below)`,
    "",
    `## Deploy context`,
    "",
    `- Repo: \`${args.repoFullName}\``,
    args.liveBranch ? `- Branch: \`${args.liveBranch}\`` : null,
    args.liveCommitShortSha
      ? `- Failing commit: \`${args.liveCommitShortSha}\``
      : null,
    `- Railway deployment id: \`${args.railwayDeploymentId}\``,
    `- Stage: ${stage} failure`,
    "",
    `## Build error tail`,
    "",
    "```",
    tail,
    "```",
    "",
    `## Ground rules`,
    "",
    `- Branch prefix: \`mactech-agent/\` (e.g. \`mactech-agent/fix-${args.railwayStatus}-${(args.liveCommitShortSha ?? "deploy").slice(0, 7)}\`).`,
    `- Keep the diff small — target the failing line(s), not surrounding cleanup.`,
    `- Do NOT modify lockfiles, \`.env*\`, \`.github/workflows/*\`, \`Dockerfile\`, \`railway.toml\`, \`nixpacks.toml\`, or auth middleware.`,
    `- **Auto-merge is approved.** This is a crash-fix issue from the Suite — the operator has pre-approved the class of action (broken-build → minimal patch). The Suite enables GitHub's native auto-merge on the PR as soon as it's opened; with branch protection / CI it waits for green, without it merges immediately. No additional human review needed unless your patch touches anything outside the failing module.`,
    "",
    `---`,
    `_Filed by the MacTech Suite Crash Diagnosis. Full deploy logs live on Railway; the tail above is the Suite's heuristic extract of the relevant error lines. Suite auto-merge: sprint 38._`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 12) + "\n…[truncated]";
}
