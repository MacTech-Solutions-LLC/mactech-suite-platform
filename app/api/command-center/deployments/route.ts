/**
 * GET /api/command-center/deployments
 *
 * List of every active RailwayResource enriched with its latest
 * DeploymentSnapshot, last successful deploy timestamp, and linked app.
 * Drives the /admin/ops/deployments table.
 */

import { NextResponse } from "next/server";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getDeploymentSnapshots } from "@/lib/services/command-center/deployment-intelligence-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW);
    const rows = await getDeploymentSnapshots();
    return NextResponse.json({
      ok: true,
      deployments: rows.map((r) => ({
        resourceId: r.resource.id,
        projectId: r.resource.projectId,
        projectName: r.resource.projectName,
        serviceId: r.resource.serviceId,
        serviceName: r.resource.serviceName,
        environmentId: r.resource.environmentId,
        environmentName: r.resource.environmentName,
        publicDomain: r.resource.publicDomain,
        railwayDashboardUrl: r.resource.railwayDashboardUrl,
        active: r.resource.active,
        lastSyncedAt: r.resource.lastSyncedAt,
        lastSyncError: r.resource.lastSyncError,
        app: r.app,
        latest: r.latestSnapshot
          ? {
              status: r.latestSnapshot.railwayStatus,
              statusRaw: r.latestSnapshot.railwayStatusRaw,
              liveCommitShortSha: r.latestSnapshot.liveCommitShortSha,
              liveBranch: r.latestSnapshot.liveBranch,
              commitsBehind: r.latestSnapshot.commitsBehind,
              productionDriftStatus: r.latestSnapshot.productionDriftStatus,
              checkedAt: r.latestSnapshot.checkedAt,
              metadata: r.latestSnapshot.metadataJson,
            }
          : null,
        lastSuccessfulCheckAt: r.lastSuccessfulCheckAt,
      })),
    });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const status =
        err.code === "unauthenticated"
          ? 401
          : err.code === "permission_denied" || err.code === "no_platform_access"
            ? 403
            : 400;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 500 });
  }
}
