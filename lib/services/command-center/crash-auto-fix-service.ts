/**
 * Autonomous crash auto-fix — Sprint 41.
 *
 * Closes the last human gate in the crash → fix → redeploy loop.
 * When a deploy lands in failed/crashed state, OR the page-render
 * probe sees Next's SSR application_error sentinel, this service
 * fires fileClaudeFixIssueForCrashWithActor() to file the @claude
 * fix issue automatically. Sprint 38's webhook handler then enables
 * auto-merge on the resulting PR; the rest is autonomous.
 *
 * Safety:
 *   - Env flag AUTO_FILE_CRASH_FIXES=true required. Default OFF.
 *   - Per-app cooldown: don't re-file inside 30 minutes for the
 *     same app (audit-log-derived, no extra schema). Lets the prior
 *     PR land + redeploy + the dashboard observe whether it worked
 *     before another issue gets filed.
 *   - Same CROSS_REPO_ALLOWLIST + GITHUB_TOKEN gates as the manual
 *     path (delegated to fileClaudeFixIssueForCrashWithActor).
 *   - One audit log entry per skip-vs-attempt so a reviewer can see
 *     why a crash didn't get auto-filed.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { fileClaudeFixIssueForCrashWithActor } from "./file-claude-fix-actions";

const COOLDOWN_MIN = 30;

const SYSTEM_ACTOR = {
  clerkUserId: null,
  email: "system+auto-fix@mactech.suite",
  userProfileId: null,
};

export interface AutoFixOutcome {
  attempted: boolean;
  skippedReason?:
    | "feature_disabled"
    | "no_repo_mapping"
    | "in_cooldown"
    | "already_open_issue";
  fileResult?: Awaited<ReturnType<typeof fileClaudeFixIssueForCrashWithActor>>;
}

/**
 * Decide-and-fire for a single DeploymentSnapshot. Caller passes the
 * snapshot id; this function reads the surrounding state, checks
 * gates, and either fires or audits the skip.
 */
export async function maybeAutoFileFixForSnapshot(
  snapshotId: string,
  trigger: "reconciliation" | "railway_webhook",
): Promise<AutoFixOutcome> {
  if (!env.AUTO_FILE_CRASH_FIXES) {
    return { attempted: false, skippedReason: "feature_disabled" };
  }

  const snap = await prisma.deploymentSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      appRegistryId: true,
      app: { select: { appKey: true, repoFullName: true } },
      railwayStatus: true,
      liveCommitShortSha: true,
    },
  });
  if (!snap?.app?.repoFullName || !snap.appRegistryId) {
    return { attempted: false, skippedReason: "no_repo_mapping" };
  }

  // Cooldown — derived from audit log so we don't need an extra
  // table. Looks for any successful fix-issue filed for this
  // appRegistryId within the cooldown window.
  const cooldownStart = new Date(Date.now() - COOLDOWN_MIN * 60 * 1000);
  const recent = await prisma.auditLog.findFirst({
    where: {
      eventType: "command_center.deploy.fix_issue.filed",
      timestamp: { gte: cooldownStart },
      metadataJson: { path: ["repoFullName"], equals: snap.app.repoFullName },
    },
    select: { id: true, timestamp: true, metadataJson: true },
    orderBy: { timestamp: "desc" },
  });
  if (recent) {
    await writeAuditLog({
      eventType: "command_center.deploy.auto_fix.skipped",
      eventCategory: "system",
      severity: "info",
      action: `auto-fix skipped for ${snap.app.repoFullName}: cooldown (${COOLDOWN_MIN}m since last fix issue)`,
      resourceType: "deployment_snapshot",
      resourceId: snap.id,
      metadata: {
        repoFullName: snap.app.repoFullName,
        snapshotId: snap.id,
        railwayStatus: snap.railwayStatus,
        cooldownMinutes: COOLDOWN_MIN,
        lastIssueAuditId: recent.id,
        lastIssueAt: recent.timestamp.toISOString(),
        trigger,
      },
    });
    return { attempted: false, skippedReason: "in_cooldown" };
  }

  // Fire.
  const result = await fileClaudeFixIssueForCrashWithActor(
    snap.id,
    SYSTEM_ACTOR,
  );
  await writeAuditLog({
    eventType: result.ok
      ? "command_center.deploy.auto_fix.attempted"
      : "command_center.deploy.auto_fix.failed",
    eventCategory: "system",
    severity: result.ok ? "info" : "warning",
    action: result.ok
      ? `auto-fix fired for ${snap.app.repoFullName} → issue #${result.issueNumber}`
      : `auto-fix attempt failed for ${snap.app.repoFullName}: ${result.reason}`,
    resourceType: "deployment_snapshot",
    resourceId: snap.id,
    metadata: {
      repoFullName: snap.app.repoFullName,
      snapshotId: snap.id,
      railwayStatus: snap.railwayStatus,
      liveCommitShortSha: snap.liveCommitShortSha,
      trigger,
      issueNumber: result.issueNumber ?? null,
      issueUrl: result.issueUrl ?? null,
      reason: result.reason ?? null,
    },
  });
  return { attempted: true, fileResult: result };
}

export function autoFixEnabled(): boolean {
  return Boolean(env.AUTO_FILE_CRASH_FIXES);
}
