/**
 * GET /api/command-center/risks
 *
 * Returns currently-open OperationalRiskFlag rows, severity-sorted.
 * Used by /command-center's risk feed and by downstream alerting.
 */

import { NextResponse } from "next/server";
import { getOpenRiskFlags } from "@/lib/services/command-center/command-center-service";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.RISK_VIEW);
    const risks = await getOpenRiskFlags(100);
    return NextResponse.json({
      ok: true,
      risks: risks.map((r) => ({
        id: r.id,
        appKey: r.app?.appKey ?? null,
        appName: r.app?.name ?? null,
        category: r.category,
        severity: r.severity,
        title: r.title,
        description: r.description,
        detectedAt: r.detectedAt,
        acknowledgedAt: r.acknowledgedAt,
        acknowledgedBy: r.acknowledgedBy,
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
