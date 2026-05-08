/**
 * POST /api/agents/plan
 *
 * Body: { request: string }
 *
 * Translates a natural-language request into a plan and persists it
 * as an AgentRun. The plan does NOT execute on its own — see
 * /api/agents/[id]/execute. If the plan contains any approval_required
 * steps, the run lands in awaiting_approval status; otherwise it lands
 * in planned status.
 *
 * Permission: platform:agents:create.
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { createPlan } from "@/lib/agents/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
    }
    const requestText = body.request;
    if (typeof requestText !== "string" || requestText.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "request_required" }, { status: 400 });
    }
    if (requestText.length > 4000) {
      return NextResponse.json({ ok: false, error: "request_too_long" }, { status: 400 });
    }
    const out = await createPlan({
      request: requestText.trim(),
      requesterClerkUserId: ctx.clerkUserId,
      requesterEmail: ctx.userProfile.email,
    });
    return NextResponse.json({ ok: true, runId: out.runId });
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
    console.error("[api/agents/plan]", err);
    return NextResponse.json({ ok: false, error: "plan_failed" }, { status: 500 });
  }
}
