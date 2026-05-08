/**
 * GET /api/command-center/status
 *
 * Returns the aggregate counters that drive the /command-center
 * overview tiles. Cheap query — fine to call on page load and to
 * poll from the SyncNowButton afterglow.
 *
 * Auth: COMMAND_CENTER_VIEW. mactech_admin / support / auditor /
 * read-only all hold this; cui_auditor does not.
 */

import { NextResponse } from "next/server";
import { getCommandCenterStatus } from "@/lib/services/command-center/command-center-service";
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
    const status = await getCommandCenterStatus();
    return NextResponse.json({ ok: true, status });
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
    return NextResponse.json({ ok: false, error: "status_failed" }, { status: 500 });
  }
}
