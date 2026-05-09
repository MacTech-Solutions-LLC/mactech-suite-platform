/**
 * Read-side queries for deployment intelligence.
 *
 *   getDeploymentSnapshots()             — /admin/ops/deployments table
 *   getDeploymentsOverview()             — /admin/ops/deployments tiles (slice 12)
 *   getRecentDeployments()               — /admin/ops/deployments timeline (slice 12)
 *   getRecentHealthCheckHistory()        — /admin/ops/health time series
 *   getDeploymentSnapshotForApp()        — input to the deployment risk evaluator
 *
 * Pure read functions; permission gating happens in the route + page.
 */

import { prisma } from "@/lib/db/prisma";
import type {
  AppRegistry,
  DeploymentSnapshot,
  HealthCheckSnapshot,
  RailwayResource,
} from "@prisma/client";

export interface DeploymentSnapshotRow {
  resource: RailwayResource;
  app: { id: string; appKey: string; name: string; criticality: string } | null;
  latestSnapshot: DeploymentSnapshot | null;
  /** Most recent successful deploy (across all snapshots for this resource).
   *  Drives the stale_deployment evaluator. */
  lastSuccessfulCheckAt: Date | null;
}

export async function getDeploymentSnapshots(): Promise<DeploymentSnapshotRow[]> {
  const resources = await prisma.railwayResource.findMany({
    where: { active: true },
    orderBy: [{ projectName: "asc" }, { serviceName: "asc" }],
    include: {
      app: {
        select: { id: true, appKey: true, name: true, criticality: true },
      },
      deploymentSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
      },
    },
  });

  // For each resource, fetch the most recent successful checkedAt
  // across the whole snapshot history. One groupBy query is much
  // cheaper than per-row.
  const resourceIds = resources.map((r) => r.id);
  const lastSuccessRows = resourceIds.length
    ? await prisma.deploymentSnapshot.groupBy({
        by: ["railwayResourceId"],
        where: {
          railwayResourceId: { in: resourceIds },
          railwayStatus: "success",
        },
        _max: { checkedAt: true },
      })
    : [];
  const lastSuccessByResource = new Map<string, Date>(
    lastSuccessRows
      .filter((r) => r._max.checkedAt)
      .map((r) => [r.railwayResourceId, r._max.checkedAt!]),
  );

  return resources.map((r) => ({
    resource: r,
    app: r.app,
    latestSnapshot: r.deploymentSnapshots[0] ?? null,
    lastSuccessfulCheckAt: lastSuccessByResource.get(r.id) ?? null,
  }));
}

export interface HealthHistoryRow {
  app: AppRegistry;
  /** Most recent N snapshots, newest first. */
  snapshots: HealthCheckSnapshot[];
}

export async function getRecentHealthCheckHistory(
  perAppLimit = 24,
): Promise<HealthHistoryRow[]> {
  const apps = await prisma.appRegistry.findMany({
    where: { status: "active" },
    orderBy: [{ criticality: "desc" }, { name: "asc" }],
    include: {
      healthSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: perAppLimit,
      },
    },
  });
  return apps.map((a) => ({ app: a, snapshots: a.healthSnapshots }));
}

/**
 * Snapshot fed to evaluateDeploymentRisks() during reconciliation.
 * Reads Slice 3's own DeploymentSnapshot rows so the rule set runs
 * even if Slice 2's GitHub sync is offline.
 */
export async function getDeploymentSnapshotForApp(
  app: AppRegistry,
): Promise<{
  hasRailwayMapping: boolean;
  resource: RailwayResource | null;
  latest: DeploymentSnapshot | null;
  lastSuccessfulAt: Date | null;
} | null> {
  const resource = await prisma.railwayResource.findFirst({
    where: { appRegistryId: app.id, active: true },
  });
  if (!resource) {
    return {
      hasRailwayMapping: false,
      resource: null,
      latest: null,
      lastSuccessfulAt: null,
    };
  }
  const [latest, success] = await Promise.all([
    prisma.deploymentSnapshot.findFirst({
      where: { railwayResourceId: resource.id },
      orderBy: { checkedAt: "desc" },
    }),
    prisma.deploymentSnapshot.findFirst({
      where: { railwayResourceId: resource.id, railwayStatus: "success" },
      orderBy: { checkedAt: "desc" },
      select: { checkedAt: true },
    }),
  ]);
  return {
    hasRailwayMapping: true,
    resource,
    latest,
    lastSuccessfulAt: success?.checkedAt ?? null,
  };
}

// ─── Slice 12 — /admin/ops/deployments dashboard ──────────────────────────

export interface DeploymentsOverview {
  /** Total tracked Railway resources (project+service+env tuples). */
  totalResources: number;
  /** Latest-snapshot status counts across every tracked resource. */
  byStatus: {
    success: number;
    failed: number;
    crashed: number;
    deploying: number;
    building: number;
    unknown: number;
  };
  /** Latest-snapshot drift counts across every tracked resource. */
  byDrift: {
    inSync: number;
    behind: number;
    ahead: number;
    diverged: number;
    unknown: number;
  };
  /** Resources whose last successful deploy was > 14 days ago — the
   *  stale-deployment evaluator's threshold, surfaced here so the tile
   *  reads the same number you'd see on /admin/ops/risk. */
  staleResourceCount: number;
  /** 24h deploy attempt → success ratio. Computed from
   *  DeploymentSnapshot rows in the window. Returns null when there
   *  were no deploys in the window (avoids "0% / 0 deploys" reading
   *  as bad news). */
  successRate24h: number | null;
  /** Number of failed/crashed snapshots seen in the last 24h. */
  failedDeployments24h: number;
}

export async function getDeploymentsOverview(): Promise<DeploymentsOverview> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stalenessCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const resources = await prisma.railwayResource.findMany({
    where: { active: true },
    select: {
      id: true,
      deploymentSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { railwayStatus: true, productionDriftStatus: true },
      },
    },
  });

  const byStatus = { success: 0, failed: 0, crashed: 0, deploying: 0, building: 0, unknown: 0 };
  const byDrift = { inSync: 0, behind: 0, ahead: 0, diverged: 0, unknown: 0 };
  for (const r of resources) {
    const latest = r.deploymentSnapshots[0];
    const status = (latest?.railwayStatus ?? "unknown") as keyof typeof byStatus;
    if (status in byStatus) byStatus[status] += 1;
    else byStatus.unknown += 1;

    const driftRaw = latest?.productionDriftStatus ?? "unknown";
    const drift = ({
      in_sync: "inSync",
      behind: "behind",
      ahead: "ahead",
      diverged: "diverged",
      unknown: "unknown",
    } as const)[driftRaw] ?? "unknown";
    byDrift[drift as keyof typeof byDrift] += 1;
  }

  const [staleSuccessRows, deploys24h, failed24h] = await Promise.all([
    prisma.deploymentSnapshot.groupBy({
      by: ["railwayResourceId"],
      where: { railwayStatus: "success" },
      _max: { checkedAt: true },
    }),
    prisma.deploymentSnapshot.count({
      where: { checkedAt: { gte: since } },
    }),
    prisma.deploymentSnapshot.count({
      where: {
        checkedAt: { gte: since },
        railwayStatus: { in: ["failed", "crashed"] },
      },
    }),
  ]);

  // A resource is "stale" if its last successful deploy is older than
  // the cutoff OR it has never had a successful deploy. We trust the
  // active-resources list as the source of truth for "tracked".
  const lastSuccessByResource = new Map<string, Date>(
    staleSuccessRows
      .filter((r) => r._max.checkedAt)
      .map((r) => [r.railwayResourceId, r._max.checkedAt!]),
  );
  let staleResourceCount = 0;
  for (const r of resources) {
    const lastSuccess = lastSuccessByResource.get(r.id);
    if (!lastSuccess || lastSuccess < stalenessCutoff) staleResourceCount += 1;
  }

  const successRate24h =
    deploys24h === 0
      ? null
      : Math.round(((deploys24h - failed24h) / deploys24h) * 100);

  return {
    totalResources: resources.length,
    byStatus,
    byDrift,
    staleResourceCount,
    successRate24h,
    failedDeployments24h: failed24h,
  };
}

export interface RecentDeployment {
  id: string;
  appKey: string | null;
  appName: string | null;
  serviceName: string | null;
  projectName: string | null;
  railwayStatus: string;
  productionDriftStatus: string;
  liveCommitShortSha: string | null;
  liveBranch: string | null;
  commitsBehind: number | null;
  checkedAt: Date;
}

/** Cross-app deploy timeline. Latest-first, deduplicated to one row
 *  per (railwayDeploymentId) since the same deploy can be rechecked
 *  multiple times. */
export async function getRecentDeployments(limit = 30): Promise<RecentDeployment[]> {
  // Pull more than `limit` rows because we'll dedupe by deployment id.
  const raw = await prisma.deploymentSnapshot.findMany({
    orderBy: { checkedAt: "desc" },
    take: limit * 3,
    include: {
      app: { select: { appKey: true, name: true } },
      railwayResource: { select: { serviceName: true, projectName: true } },
    },
  });

  const seen = new Set<string>();
  const out: RecentDeployment[] = [];
  for (const r of raw) {
    if (seen.has(r.railwayDeploymentId)) continue;
    seen.add(r.railwayDeploymentId);
    out.push({
      id: r.id,
      appKey: r.app?.appKey ?? null,
      appName: r.app?.name ?? null,
      serviceName: r.railwayResource?.serviceName ?? null,
      projectName: r.railwayResource?.projectName ?? null,
      railwayStatus: r.railwayStatus,
      productionDriftStatus: r.productionDriftStatus,
      liveCommitShortSha: r.liveCommitShortSha,
      liveBranch: r.liveBranch,
      commitsBehind: r.commitsBehind,
      checkedAt: r.checkedAt,
    });
    if (out.length >= limit) break;
  }
  return out;
}
