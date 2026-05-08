/**
 * POST /api/agents/intent/validate
 *
 * Body: { goal: string }
 *
 * Cheap goal-only validation for the IntentBuilder UI's live-feedback
 * banner. Permission: platform:agents:create (no DB write happens, but
 * we still gate so the rule book isn't enumerable by anyone with a
 * Clerk session).
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { validateGoalForUi } from "@/lib/agents/intent/validator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
    }
    const goal = typeof body.goal === "string" ? body.goal : "";
    const v = validateGoalForUi(goal);
    return NextResponse.json({ ok: true, valid: v.valid, errors: v.errors });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const status = err.code === "unauthenticated" ? 401 : 403;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    return NextResponse.json({ ok: false, error: "validate_failed" }, { status: 500 });
  }
}
