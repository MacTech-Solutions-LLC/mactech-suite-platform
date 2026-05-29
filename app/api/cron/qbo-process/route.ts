/**
 * Sweep endpoint for retrying QBO webhook events that failed inline.
 *
 * Auth: shared CRON_SECRET in either Authorization: Bearer <secret>
 * or ?secret=<secret>. Same pattern as the existing command-center
 * cron endpoints — keeps a scheduler outside our auth perimeter
 * from being able to drive the system.
 *
 * Safe to call repeatedly. Returns {processed, failed, skipped} counts.
 */

import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { processPendingEvents } from "@/lib/services/qbo-event-processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    new URL(request.url).searchParams.get("secret");
  if (!provided || provided !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await processPendingEvents();
  return NextResponse.json({ ok: true, ...summary });
}
