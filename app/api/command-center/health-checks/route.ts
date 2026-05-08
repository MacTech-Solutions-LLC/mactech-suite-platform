/**
 * GET /api/command-center/health-checks
 *
 * Recent health-check time series, grouped per app. Drives
 * /admin/ops/health which complements Slice 1's overview tile with
 * per-app history + latency.
 */

import { NextResponse } from "next/server";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRecentHealthCheckHistory } from "@/lib/services/command-center/deployment-intelligence-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
    const rows = await getRecentHealthCheckHistory(24);
    return NextResponse.json({
      ok: true,
      apps: rows.map((r) => ({
        appKey: r.app.appKey,
        name: r.app.name,
        criticality: r.app.criticality,
        healthUrl: r.app.healthUrl,
        snapshots: r.snapshots.map((s) => ({
          status: s.status,
          statusCode: s.statusCode,
          latencyMs: s.latencyMs,
          checkedAt: s.checkedAt,
          errorMessage: s.errorMessage,
        })),
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
