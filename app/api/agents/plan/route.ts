/**
 * POST /api/agents/plan
 *
 * Body (Slice 5.5 — IBE-gated):
 *   {
 *     request: string,                    // legacy + LLM planner input
 *     intent?: {
 *       goal: string,                     // IBE-validated; verb + measurable
 *       scopeAppIds: string[],            // empty = unbounded
 *       scopeRepoIds: string[],           // empty = unbounded
 *       invariants: { [capabilityKey]: string[] },
 *       riskTolerance: "strict" | "moderate" | "permissive",
 *     }
 *   }
 *
 * When `intent` is present, the orchestrator validates goal +
 * scope + invariants up front; failure returns 422 with
 * { ok: false, error: "intent_invalid", details: [...] } so the UI
 * can render specific IBE refusal reasons next to the bad field.
 *
 * Permission: platform:agents:create.
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  createPlan,
  IntentValidationFailedError,
} from "@/lib/agents/orchestrator";
import type { Intent } from "@/lib/agents/intent/types";
import type { AgentRiskTolerance } from "@prisma/client";

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

    const intent = parseIntent(body.intent);

    const out = await createPlan({
      request: requestText.trim(),
      requesterClerkUserId: ctx.clerkUserId,
      requesterEmail: ctx.userProfile.email,
      intent,
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
    if (err instanceof IntentValidationFailedError) {
      return NextResponse.json(
        { ok: false, error: "intent_invalid", details: err.errors },
        { status: 422 },
      );
    }
    console.error("[api/agents/plan]", err);
    return NextResponse.json({ ok: false, error: "plan_failed" }, { status: 500 });
  }
}

function parseIntent(raw: unknown): Intent | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const goal = typeof r.goal === "string" ? r.goal.trim() : "";
  const scopeAppIds = Array.isArray(r.scopeAppIds)
    ? r.scopeAppIds.filter((x): x is string => typeof x === "string")
    : [];
  const scopeRepoIds = Array.isArray(r.scopeRepoIds)
    ? r.scopeRepoIds.filter((x): x is string => typeof x === "string")
    : [];
  const invariants =
    r.invariants && typeof r.invariants === "object" && !Array.isArray(r.invariants)
      ? Object.fromEntries(
          Object.entries(r.invariants as Record<string, unknown>)
            .filter(([_, v]) => Array.isArray(v))
            .map(([k, v]) => [
              k,
              (v as unknown[]).filter((x): x is string => typeof x === "string"),
            ]),
        )
      : {};
  const tol = r.riskTolerance;
  const riskTolerance: AgentRiskTolerance =
    tol === "moderate" || tol === "permissive" ? tol : "strict";

  // If the user didn't actually declare a goal, treat the whole intent
  // as absent (legacy path). The body fields are always present in the
  // new UI but optional in the API.
  if (!goal) return undefined;

  return { goal, scopeAppIds, scopeRepoIds, invariants, riskTolerance };
}
