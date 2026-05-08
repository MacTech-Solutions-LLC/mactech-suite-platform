/**
 * GET /api/command-center/ecosystem
 *
 * Returns nodes (every active app) + edges (every AppDependency row),
 * decorated with current health + open risk count + integration
 * mapping flags. Drives /admin/ops/ecosystem.
 */

import { NextResponse } from "next/server";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getEcosystemGraph } from "@/lib/services/command-center/ecosystem-graph-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
    const graph = await getEcosystemGraph();
    return NextResponse.json({ ok: true, ...graph });
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
    return NextResponse.json({ ok: false, error: "graph_failed" }, { status: 500 });
  }
}
