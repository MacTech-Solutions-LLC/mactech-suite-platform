/**
 * GET    /api/agents/triggers/[id] — fetch one
 * PATCH  /api/agents/triggers/[id] — update fields (full replace)
 * DELETE /api/agents/triggers/[id] — remove
 * POST   /api/agents/triggers/[id]?action=enable|disable — toggle
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  deleteTrigger,
  getTrigger,
  setTriggerEnabled,
  updateTrigger,
} from "@/lib/agents/triggers-service";
import { handleError, parseSaveInput } from "../_helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const trigger = await getTrigger(params.id);
    if (!trigger) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, trigger });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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
    const trigger = await updateTrigger(params.id, parsed);
    return NextResponse.json({ ok: true, trigger });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteTrigger(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const action = request.nextUrl.searchParams.get("action");
    if (action === "enable" || action === "disable") {
      const trigger = await setTriggerEnabled(params.id, action === "enable");
      return NextResponse.json({ ok: true, trigger });
    }
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (err) {
    return handleError(err);
  }
}
