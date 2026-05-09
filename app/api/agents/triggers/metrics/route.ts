/**
 * GET /api/agents/triggers/metrics — Slice 9 threshold metric catalog.
 *
 * Returns the code-defined metric registry (key + label + description
 * + unit + windowHours) so the TriggerForm can render the metric
 * dropdown without hardcoding the list. Permission: AGENTS_VIEW.
 */

import { NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { listThresholdMetrics } from "@/lib/agents/threshold-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_VIEW);
    const metrics = listThresholdMetrics().map((m) => ({
      key: m.key,
      label: m.label,
      description: m.description,
      unit: m.unit,
      windowHours: m.windowHours ?? null,
    }));
    return NextResponse.json({ ok: true, metrics });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const status = err.code === "unauthenticated" ? 401 : 403;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    return NextResponse.json({ ok: false, error: "metrics_failed" }, { status: 500 });
  }
}
