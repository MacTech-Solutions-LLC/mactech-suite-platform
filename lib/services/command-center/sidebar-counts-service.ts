/**
 * Sidebar live counts — Sprint 14 (make-it-real pass).
 *
 * Single Promise.all of bounded counts that the AdminShell passes
 * into <Sidebar />. Each entry maps to one nav item's href and gets
 * rendered as a small badge next to the label. Cheap by design —
 * counts only, no findMany — so the AdminShell layout stays fast.
 *
 * The point of this is ambient awareness: when an operator opens
 * the Suite, the sidebar tells them where the work is. "Runtime
 * Risk (3 critical)" + "Agents (2 awaiting)" replaces "scroll the
 * Today digest to find out what's happening."
 */

import { prisma } from "@/lib/db/prisma";

export interface SidebarCounts {
  /** Awaiting-approval agent runs — direct call to action. */
  agentsAwaiting: number;
  /** Open critical or high-severity operational risks. */
  riskCriticalHigh: number;
  /** Tracked Railway resources whose latest snapshot is failed/crashed. */
  deploymentsBroken: number;
  /** Workflow runs whose conclusion was failure/timed_out/startup_failure
   *  in the last 24h. */
  workflowsFailed24h: number;
  /** Open security events — anything not yet triaged. */
  securityEventsOpen: number;
  /** Apps currently rendering "down" on the public status page. */
  publicStatusDown: number;
  /** Commits in the last 24h that picked up a riskFlag (security-
   *  relevant change worth a glance). */
  commitsFlagged24h: number;
}

const ZERO: SidebarCounts = {
  agentsAwaiting: 0,
  riskCriticalHigh: 0,
  deploymentsBroken: 0,
  workflowsFailed24h: 0,
  securityEventsOpen: 0,
  publicStatusDown: 0,
  commitsFlagged24h: 0,
};

export async function getSidebarCounts(): Promise<SidebarCounts> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      agentsAwaiting,
      riskCriticalHigh,
      workflowsFailed24h,
      securityEventsOpen,
      publicStatusDown,
      commitsFlagged24h,
      brokenLatest,
    ] = await Promise.all([
      prisma.agentRun.count({ where: { status: "awaiting_approval" } }),
      prisma.operationalRiskFlag.count({
        where: { status: "open", severity: { in: ["critical", "high"] } },
      }),
      prisma.gitWorkflowRun.count({
        where: {
          startedAt: { gte: since },
          conclusion: { in: ["failure", "timed_out", "startup_failure"] },
        },
      }),
      prisma.securityEvent.count({ where: { status: "open" } }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "AppRegistry" a
        WHERE a."publicStatusVisible" = true
          AND a.status = 'active'
          AND (
            SELECT s.status::text FROM "HealthCheckSnapshot" s
            WHERE s."appRegistryId" = a.id
            ORDER BY s."checkedAt" DESC
            LIMIT 1
          ) = 'down'
      `,
      // Commits flagged in the last 24h. riskFlagsJson is an array;
      // count rows whose array isn't empty.
      prisma.gitCommitEvent.count({
        where: {
          committedAt: { gte: since },
          NOT: { riskFlagsJson: { equals: [] } },
        },
      }),
      // Broken deployments — the latest snapshot per active Railway
      // resource that's failed/crashed. Done as a $queryRaw because
      // Prisma doesn't have a clean "latest per group" without a
      // subquery either.
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT DISTINCT ON (s."railwayResourceId") s."railwayStatus"
          FROM "DeploymentSnapshot" s
          JOIN "RailwayResource" r ON r.id = s."railwayResourceId"
          WHERE r.active = true
          ORDER BY s."railwayResourceId", s."checkedAt" DESC
        ) latest
        WHERE latest."railwayStatus" IN ('failed', 'crashed')
      `,
    ]);

    return {
      agentsAwaiting,
      riskCriticalHigh,
      deploymentsBroken: Number(brokenLatest[0]?.count ?? 0),
      workflowsFailed24h,
      securityEventsOpen,
      publicStatusDown: Number(publicStatusDown[0]?.count ?? 0),
      commitsFlagged24h,
    };
  } catch (err) {
    // The sidebar must NEVER throw the layout — render zeros if any
    // single count fails. The badges are nice-to-have ambient
    // awareness, not load-bearing for any user flow.
    console.warn("[sidebar-counts] fallback to zeros:", err);
    return ZERO;
  }
}
