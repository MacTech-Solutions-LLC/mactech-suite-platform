/**
 * Read-side queries for deployment intelligence.
 *
 *   getDeploymentSnapshots()             — /admin/ops/deployments table
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
