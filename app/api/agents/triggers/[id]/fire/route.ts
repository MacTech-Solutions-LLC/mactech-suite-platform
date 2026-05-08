/**
 * POST /api/agents/triggers/[id]/fire — Slice 5.8 manual fire.
 *
 * Lets an admin click "Fire now" on the trigger detail page without
 * waiting for the cron tick. Same audit + safety story as the cron
 * tick: synthetic requester `cron:<triggerId>`, IBE-gated execution,
 * approval gate preserved for write capabilities.
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getTrigger } from "@/lib/agents/triggers-service";
import { fireTrigger } from "@/lib/agents/scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);
    const trigger = await getTrigger(params.id);
    if (!trigger) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const out = await fireTrigger(trigger, "manual", {
      clerkUserId: ctx.clerkUserId,
      email: ctx.userProfile.email,
    });
    return NextResponse.json({ ok: true, ...out });
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
    console.error("[api/agents/triggers/[id]/fire]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "fire_failed",
      },
      { status: 500 },
    );
  }
}
