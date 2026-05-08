/**
 * POST /api/agents/[id]/execute
 *
 * No body. Runs an AgentRun that's in `planned` (read-only-only plan)
 * or `approved` status (approval-required plan that's been approved).
 *
 * Permission: platform:agents:create OR platform:agents:approve
 * (approval-required runs require either the requester resuming after
 * approval, or the approver clicking through). Manage permission also
 * works because mactech_super_admin holds Object.values(...).
 *
 * The orchestrator validates the run state and re-validates capability
 * keys against the in-process registry before each step.
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requireAuthContext } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { ExecutionError, executeRun } from "@/lib/agents/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requireAuthContext();
    const has =
      ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE) ||
      ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_APPROVE);
    if (!has) {
      return NextResponse.json(
        { ok: false, error: "permission_denied" },
        { status: 403 },
      );
    }
    const out = await executeRun({
      runId: params.id,
      executorClerkUserId: ctx.clerkUserId,
      executorEmail: ctx.userProfile.email,
    });
    return NextResponse.json({ ok: true, status: out.status });
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
    if (err instanceof ExecutionError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: 409 });
    }
    console.error("[api/agents/[id]/execute]", err);
    return NextResponse.json({ ok: false, error: "execute_failed" }, { status: 500 });
  }
}
