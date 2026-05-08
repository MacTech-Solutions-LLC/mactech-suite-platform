/**
 * POST /api/command-center/sync
 *
 * Triggers a full Command Center reconciliation: probe every active app,
 * reconcile risk flags, emit IntegrationEvent + AuditLog summary.
 *
 * Two ways to call it:
 *   1. Authenticated browser session with COMMAND_CENTER_MANAGE permission.
 *      Used by the "Sync now" button on /command-center.
 *   2. Bearer token equal to COMMAND_CENTER_CRON_SECRET, for cron / CI.
 *      Anonymous to Clerk; the secret IS the auth.
 *
 * Idempotent and fault-tolerant: one app's probe failing cannot crash
 * the whole run; per-app errors come back in the response payload.
 */

import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runReconciliation } from "@/lib/services/command-center/command-center-service";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Path 1: cron secret in Authorization header.
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const provided = authHeader.slice("Bearer ".length).trim();
    const expected = env.COMMAND_CENTER_CRON_SECRET;
    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "cron_secret_not_configured" },
        { status: 503 },
      );
    }
    if (provided !== expected) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const outcome = await runReconciliation("cron", null);
    return NextResponse.json({ ok: true, outcome });
  }

  // Path 2: authenticated browser session. Manage perm required.
  try {
    const ctx = await requirePlatformPermission(
      PLATFORM_PERMISSIONS.COMMAND_CENTER_MANAGE,
    );
    const outcome = await runReconciliation("manual", ctx.userProfile.email);
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const status =
        err.code === "unauthenticated"
          ? 401
          : err.code === "permission_denied" || err.code === "no_platform_access"
            ? 403
            : 400;
      return NextResponse.json({ ok: false, error: err.code, message: err.message }, { status });
    }
    return NextResponse.json(
      { ok: false, error: "reconciliation_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
