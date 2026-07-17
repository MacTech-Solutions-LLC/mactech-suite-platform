/**
 * PATCH /api/feedback/[id]
 *
 * Update a single feedback item's triage state from /admin/feedback:
 * change status and/or attach admin notes. Requires
 * platform:feedback:manage.
 *
 * Body: { status?: FeedbackStatus, adminNotes?: string }
 *   - status must be one of the FeedbackStatus enum values.
 *   - Setting status to `resolved` stamps resolvedAt.
 *   - `dispatched` is not settable here — a run link is only created by
 *     POST /api/feedback/dispatch, which owns agentRunId.
 *
 * Response: 200 { ok: true }
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import type { FeedbackStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Statuses an admin can set by hand. `dispatched` is excluded — only the
// dispatch route assigns it (together with the agentRunId link).
const SETTABLE_STATUSES: FeedbackStatus[] = [
  "new",
  "acknowledged",
  "resolved",
  "dismissed",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.FEEDBACK_MANAGE);

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
    }

    const data: Prisma.FeedbackUpdateInput = {};

    if (body.status !== undefined) {
      const status = body.status;
      if (
        typeof status !== "string" ||
        !SETTABLE_STATUSES.includes(status as FeedbackStatus)
      ) {
        return NextResponse.json(
          { ok: false, error: "invalid_status" },
          { status: 400 },
        );
      }
      data.status = status as FeedbackStatus;
      data.resolvedAt = status === "resolved" ? new Date() : null;
    }

    if (body.adminNotes !== undefined) {
      if (body.adminNotes !== null && typeof body.adminNotes !== "string") {
        return NextResponse.json(
          { ok: false, error: "invalid_notes" },
          { status: 400 },
        );
      }
      const notes =
        typeof body.adminNotes === "string" ? body.adminNotes.trim() : "";
      data.adminNotes = notes.length > 0 ? notes.slice(0, 5000) : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
    }

    const updated = await prisma.feedback.updateMany({
      where: { id: params.id },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

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
    console.error("[api/feedback/[id]]", err);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
