/**
 * GET  /api/agents/triggers — list all AgentTriggers
 * POST /api/agents/triggers — create a new trigger
 *
 * Browser-only routes (Clerk session). Trigger CRUD is gated on
 * AGENTS_VIEW (read) and AGENTS_CREATE (write). Re-checked inside
 * the service layer (defence in depth).
 */

import { type NextRequest, NextResponse } from "next/server";
import { createTrigger, listTriggers } from "@/lib/agents/triggers-service";
import { handleError, parseSaveInput } from "./_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const triggers = await listTriggers();
    return NextResponse.json({ ok: true, triggers });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
    }
    const parsed = parseSaveInput(body);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
    }
    const trigger = await createTrigger(parsed);
    return NextResponse.json({ ok: true, trigger });
  } catch (err) {
    return handleError(err);
  }
}
