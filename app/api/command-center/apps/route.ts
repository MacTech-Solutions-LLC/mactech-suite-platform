/**
 * GET /api/command-center/apps
 *
 * Returns every active AppRegistry row enriched with its latest health
 * snapshot and open risk flags. Used by the page's "apps" table and by
 * downstream tooling that wants the same shape.
 */

import { NextResponse } from "next/server";
import { getAppOperationalSnapshots } from "@/lib/services/command-center/command-center-service";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.COMMAND_CENTER_VIEW);
    const snapshots = await getAppOperationalSnapshots();
    return NextResponse.json({
      ok: true,
      apps: snapshots.map((s) => ({
        id: s.app.id,
        appKey: s.app.appKey,
        name: s.app.name,
        publicUrl: s.app.publicUrl,
        healthUrl: s.app.healthUrl,
        category: s.app.category,
        criticality: s.app.criticality,
        lifecycle: s.app.lifecycle,
        visibility: s.app.visibility,
        repoFullName: s.app.repoFullName,
        railwayServiceId: s.app.railwayServiceId,
        latestHealth: s.latestHealth
          ? {
              status: s.latestHealth.status,
              statusCode: s.latestHealth.statusCode,
              latencyMs: s.latestHealth.latencyMs,
              checkedAt: s.latestHealth.checkedAt,
            }
          : null,
        openRiskCount: s.openRisks.length,
        topRiskSeverity: s.openRisks[0]?.severity ?? null,
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
