/**
 * POST /api/agents/[id]/approve
 *
 * Body: { decision: "approved" | "rejected", notes?: string }
 *
 * Approves or rejects an AgentRun that's in awaiting_approval status.
 * Permission: platform:agents:approve. The approver MUST NOT be the
 * requester (separation of duties — enforced inside orchestrator).
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { ApprovalError, approveRun } from "@/lib/agents/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_APPROVE);
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
    }
    const decision = body.decision;
    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json(
        { ok: false, error: "decision_must_be_approved_or_rejected" },
        { status: 400 },
      );
    }
    const notes =
      typeof body.notes === "string" && body.notes.length <= 2000 ? body.notes : undefined;
    await approveRun({
      runId: params.id,
      approverClerkUserId: ctx.clerkUserId,
      approverEmail: ctx.userProfile.email,
      decision,
      notes,
    });
    return NextResponse.json({ ok: true });
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
    if (err instanceof ApprovalError) {
      const status = err.code === "self_approval_denied" ? 403 : 409;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    console.error("[api/agents/[id]/approve]", err);
    return NextResponse.json({ ok: false, error: "approval_failed" }, { status: 500 });
  }
}
