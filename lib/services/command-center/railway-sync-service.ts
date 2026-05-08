/**
 * Railway sync service. Reads (project, service, environment) tuples
 * from AppRegistry's `railwayProjectId` / `railwayServiceId` /
 * `railwayEnvironmentId` columns, hits Railway's GraphQL API for the
 * latest deployment for each, and persists `RailwayResource` +
 * `DeploymentSnapshot` rows.
 *
 * Idempotency:
 *   - RailwayResource: unique on (serviceId, environmentId)
 *   - DeploymentSnapshot: unique on railwayDeploymentId
 *
 * Permission: the public entrypoint re-checks DEPLOYMENTS_MANAGE
 * before doing anything that mutates state. The orchestrator's
 * internal entrypoint trusts its caller (the orchestrator already
 * gated the request).
 *
 * AgentOps: the Railway API token never enters this file. We call
 * `getRailwayClient()` and accept its structured outcome. Future
 * `trigger_railway_redeploy` capability extends the client with a
 * `redeployService()` method gated behind agents:approve.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  AuthorizationError,
  type CommandCenterAuthContext,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  getRailwayClient,
  normalizeDeploymentStatus,
  type RailwayDeploymentSummary,
} from "@/lib/integrations/railway/client";
import type {
  AppRegistry,
  DeploymentDriftStatus,
  DeploymentSnapshot,
  Prisma,
  RailwayResource,
} from "@prisma/client";

export interface SyncRailwayResourceOutcome {
  resource: RailwayResource;
  latestDeployment: RailwayDeploymentSummary | null;
  snapshotId: string | null;
  warnings: string[];
}

/** Public entrypoint — caller must hold DEPLOYMENTS_MANAGE. */
export async function syncRailwayResourceForApp(
  ctx: CommandCenterAuthContext,
  appId: string,
): Promise<SyncRailwayResourceOutcome | null> {
  if (!ctx.permissions.includes(PLATFORM_PERMISSIONS.DEPLOYMENTS_MANAGE)) {
    throw new AuthorizationError(
      "DEPLOYMENTS_MANAGE required to sync a Railway resource.",
      "permission_denied",
    );
  }
  const app = await prisma.appRegistry.findUnique({ where: { id: appId } });
  if (!app) return null;
  return syncRailwayResourceInternal(app, { triggeredByEmail: ctx.userProfile.email });
}

export async function syncRailwayResourceInternal(
  app: AppRegistry,
  opts: { triggeredByEmail?: string | null } = {},
): Promise<SyncRailwayResourceOutcome | null> {
  const client = getRailwayClient();
  if (!client.configured) return null;

  // App must carry the Railway IDs the seed populated.
  const projectId = app.railwayProjectId;
  const serviceId = app.railwayServiceId;
  const environmentId = app.railwayEnvironmentId;
  if (!projectId || !serviceId || !environmentId) {
    return null;
  }

  // Fetch project metadata for display + service/environment name lookup.
  const projOut = await client.getProject(projectId);
  let projectName: string | null = null;
  let serviceName: string | null = null;
  let environmentName: string | null = app.railwayEnvironmentName ?? null;
  let dashboardUrl: string | null = null;
  let publicDomain: string | null = null;
  const warnings: string[] = [];

  if (projOut.ok) {
    projectName = projOut.data.name;
    serviceName = projOut.data.services.find((s) => s.id === serviceId)?.name ?? null;
    environmentName =
      projOut.data.environments.find((e) => e.id === environmentId)?.name ?? environmentName;
    dashboardUrl = `https://railway.app/project/${projectId}/service/${serviceId}?environmentId=${environmentId}`;
  } else {
    warnings.push(`project_${projOut.reason}`);
  }

  // Latest deployment — drives the deploy table and the risk evaluator.
  const latestOut = await client.getLatestDeployment(serviceId, environmentId);
  const latest: RailwayDeploymentSummary | null = latestOut.ok ? latestOut.data : null;
  if (!latestOut.ok) warnings.push(`deployments_${latestOut.reason}`);

  if (latest?.staticUrl) publicDomain = latest.staticUrl;

  // Upsert RailwayResource. Stamp last sync error/success regardless
  // of latest deploy outcome so the operator sees a meaningful row even
  // when the project read failed.
  const resource = await prisma.railwayResource.upsert({
    where: {
      serviceId_environmentId: { serviceId, environmentId },
    },
    create: {
      appRegistryId: app.id,
      projectId,
      projectName,
      serviceId,
      serviceName,
      environmentId,
      environmentName,
      publicDomain,
      railwayDashboardUrl: dashboardUrl,
      active: projOut.ok,
      lastSyncedAt: new Date(),
      lastSyncError: warnings.length > 0 ? warnings.join(",") : null,
    },
    update: {
      appRegistryId: app.id,
      projectId,
      projectName,
      serviceName,
      environmentName,
      publicDomain,
      railwayDashboardUrl: dashboardUrl,
      active: projOut.ok,
      lastSyncedAt: new Date(),
      lastSyncError: warnings.length > 0 ? warnings.join(",") : null,
    },
  });

  let snapshotId: string | null = null;
  if (latest) {
    const snap = await persistSnapshot(app, resource, latest);
    snapshotId = snap.id;
  }

  await writeAuditLog({
    eventType: "command_center.railway.resource_synced",
    eventCategory: "system",
    severity: warnings.length > 0 ? "warning" : "info",
    action: `Synced Railway resource for ${app.appKey}: ${serviceName ?? serviceId}/${environmentName ?? environmentId} → ${latest?.status ?? "no_deployment"}${
      warnings.length > 0 ? ` (warnings: ${warnings.join(", ")})` : ""
    }`,
    appRegistryId: app.id,
    actorEmail: opts.triggeredByEmail ?? null,
    resourceType: "railway_resource",
    resourceId: resource.id,
    metadata: {
      app_key: app.appKey,
      project_id: projectId,
      service_id: serviceId,
      environment_id: environmentId,
      latest_status_raw: latest?.status ?? null,
      latest_deployment_id: latest?.id ?? null,
      warnings,
    },
  });

  return { resource, latestDeployment: latest, snapshotId, warnings };
}

/**
 * Sync every active app that has Railway IDs configured. Used by the
 * reconciliation orchestrator. Fault-tolerant per app.
 */
export async function syncAllRailwayResources(
  triggeredByEmail: string | null,
): Promise<{
  appsAttempted: number;
  appsSucceeded: number;
  perAppErrors: Array<{ appKey: string; error: string }>;
  snapshotsWritten: number;
}> {
  const client = getRailwayClient();
  if (!client.configured) {
    return {
      appsAttempted: 0,
      appsSucceeded: 0,
      perAppErrors: [],
      snapshotsWritten: 0,
    };
  }

  const apps = await prisma.appRegistry.findMany({
    where: {
      status: "active",
      railwayProjectId: { not: null },
      railwayServiceId: { not: null },
      railwayEnvironmentId: { not: null },
    },
  });

  const perAppErrors: Array<{ appKey: string; error: string }> = [];
  let appsSucceeded = 0;
  let snapshotsWritten = 0;
  for (const app of apps) {
    try {
      const r = await syncRailwayResourceInternal(app, { triggeredByEmail });
      if (r) {
        appsSucceeded++;
        if (r.snapshotId) snapshotsWritten++;
      }
    } catch (err) {
      perAppErrors.push({
        appKey: app.appKey,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return {
    appsAttempted: apps.length,
    appsSucceeded,
    perAppErrors,
    snapshotsWritten,
  };
}

/**
 * Internal helper — write a DeploymentSnapshot for the given (app,
 * resource, latest deployment). Computes drift against the GitHub
 * HEAD already stored on the linked GitRepository row.
 */
async function persistSnapshot(
  app: AppRegistry,
  resource: RailwayResource,
  latest: RailwayDeploymentSummary,
): Promise<DeploymentSnapshot> {
  const meta = (latest.meta ?? {}) as Record<string, unknown>;
  const liveCommitSha = pickString(meta, ["commitHash", "commitSha", "head_sha"]);
  const liveBranch = pickString(meta, ["branch", "head_branch"]);
  const liveRepo = pickString(meta, ["repo", "repoFullName"]);

  // Pull GitHub HEAD off the linked GitRepository row, if any.
  let githubHeadSha: string | null = null;
  if (app.repoFullName) {
    const repo = await prisma.gitRepository.findUnique({
      where: { fullName: app.repoFullName },
      select: { latestHeadSha: true },
    });
    githubHeadSha = repo?.latestHeadSha ?? null;
  }

  const driftStatus: DeploymentDriftStatus = computeDrift(liveCommitSha, githubHeadSha);

  // Compute commitsBehind / commitsAhead lazily — we already pay for
  // GitHub compare in the Slice 2 reconciliation pass, so we don't
  // re-call it here. Slice 2's repo-evaluator picks up the same data
  // from this snapshot in subsequent runs.
  return prisma.deploymentSnapshot.upsert({
    where: { railwayDeploymentId: latest.id },
    create: {
      appRegistryId: app.id,
      railwayResourceId: resource.id,
      railwayDeploymentId: latest.id,
      railwayStatus: normalizeDeploymentStatus(latest.status),
      railwayStatusRaw: latest.status,
      liveCommitSha: liveCommitSha,
      liveCommitShortSha: liveCommitSha?.slice(0, 7) ?? null,
      liveBranch,
      liveRepo,
      githubHeadSha,
      githubHeadShortSha: githubHeadSha?.slice(0, 7) ?? null,
      productionDriftStatus: driftStatus,
      lastSuccessfulCheckAt:
        normalizeDeploymentStatus(latest.status) === "success"
          ? new Date(latest.updatedAt ?? latest.createdAt ?? Date.now())
          : null,
      checkedAt: new Date(),
      metadataJson: meta as Prisma.InputJsonValue,
    },
    update: {
      railwayStatus: normalizeDeploymentStatus(latest.status),
      railwayStatusRaw: latest.status,
      liveCommitSha,
      liveCommitShortSha: liveCommitSha?.slice(0, 7) ?? null,
      liveBranch,
      liveRepo,
      githubHeadSha,
      githubHeadShortSha: githubHeadSha?.slice(0, 7) ?? null,
      productionDriftStatus: driftStatus,
      lastSuccessfulCheckAt:
        normalizeDeploymentStatus(latest.status) === "success"
          ? new Date(latest.updatedAt ?? latest.createdAt ?? Date.now())
          : undefined,
      checkedAt: new Date(),
      metadataJson: meta as Prisma.InputJsonValue,
    },
  });
}

function pickString(meta: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

function computeDrift(
  live: string | null,
  head: string | null,
): DeploymentDriftStatus {
  if (!live || !head) return "unknown";
  if (live === head) return "in_sync";
  return "behind"; // refined to ahead/diverged when GitHub compare runs
}
