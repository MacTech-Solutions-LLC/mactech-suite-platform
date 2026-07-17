/**
 * POST /api/feedback/dispatch
 *
 * Bundles a set of feedback items into a single Claude agent run — the
 * "kick off a Claude session that reads all the feedback and corrects each
 * UI/UX issue" action from /admin/feedback.
 *
 * Body: { feedbackIds: string[] }   // if omitted/empty → all open items
 *                                    //   (status new | acknowledged)
 *
 * Flow:
 *   1. Authorize: platform:feedback:manage + platform:agents:create.
 *   2. Load the target feedback rows (only open ones are dispatchable).
 *   3. Compose one structured request describing every item + its pinned
 *      element, and call createPlan() — same orchestrator the /api/agents
 *      surface uses, so the run lands in the normal plan/approval flow.
 *   4. Link the returned runId onto every dispatched row and flip them to
 *      `dispatched`.
 *
 * Response: 200 { ok: true, runId, dispatchedCount }
 *
 * No IBE intent is attached (legacy "trust the planner" run, matching
 * /api/agents/plan when the caller sends no intent) — the goal here is a
 * human-reviewed plan, not an auto-executing one.
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { createPlan } from "@/lib/agents/orchestrator";
import { prisma } from "@/lib/db/prisma";
import { buildFeedbackAgentRequest } from "@/lib/services/feedback-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Statuses that are eligible to be sent into an agent run. */
const OPEN_STATUSES = ["new", "acknowledged"] as const;

export async function POST(request: NextRequest) {
  try {
    // Dispatch needs both feedback-manage and the agent-create right.
    const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.FEEDBACK_MANAGE);
    await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // An empty body is valid — it means "dispatch all open items".
    }

    const idFilter = Array.isArray(body.feedbackIds)
      ? body.feedbackIds.filter((x): x is string => typeof x === "string")
      : null;

    const items = await prisma.feedback.findMany({
      where: {
        status: { in: [...OPEN_STATUSES] },
        ...(idFilter && idFilter.length > 0 ? { id: { in: idFilter } } : {}),
      },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    });

    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "no_open_feedback" },
        { status: 400 },
      );
    }

    const requestText = buildFeedbackAgentRequest(items);

    const { runId } = await createPlan({
      request: requestText,
      requesterClerkUserId: ctx.clerkUserId,
      requesterEmail: ctx.userProfile.email,
    });

    await prisma.feedback.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: {
        status: "dispatched",
        agentRunId: runId,
        dispatchedAt: new Date(),
        dispatchedByEmail: ctx.userProfile.email,
      },
    });

    return NextResponse.json({
      ok: true,
      runId,
      dispatchedCount: items.length,
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
    console.error("[api/feedback/dispatch]", err);
    return NextResponse.json({ ok: false, error: "dispatch_failed" }, { status: 500 });
  }
}
