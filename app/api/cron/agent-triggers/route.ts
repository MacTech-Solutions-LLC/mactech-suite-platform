/**
 * POST /api/cron/agent-triggers — Slice 5.8 cron tick.
 *
 * Hit by an external scheduler (Railway cron / Vercel Cron / GitHub
 * Actions) every minute. Authenticates with CRON_SECRET via
 * `Authorization: Bearer <CRON_SECRET>` (matching the standard
 * Vercel-cron pattern). Without the secret, every call refuses.
 *
 * Returns a JSON tick outcome { fired, skipped, errors, details[] }
 * so the operator's monitoring stack can surface what just happened.
 */

import { type NextRequest, NextResponse } from "next/server";
import { runCronTick } from "@/lib/agents/scheduler";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "cron_secret_not_configured" },
      { status: 503 },
    );
  }
  const provided = extractBearer(request);
  if (!provided || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const outcome = await runCronTick();
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    console.error("[api/cron/agent-triggers]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "tick_failed",
      },
      { status: 500 },
    );
  }
}

// GET supported for ergonomic Railway-cron config (some schedulers
// only do GET). Same auth, same behavior.
export async function GET(request: NextRequest) {
  return POST(request);
}

function extractBearer(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  // Vercel-cron sends `x-vercel-cron` header; we don't rely on that
  // alone (Bearer is required) but the header is a useful diagnostic.
  return null;
}
