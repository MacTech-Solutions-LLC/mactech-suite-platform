/**
 * POST /api/v1/agents/runs — Slice 5.7 M2M trigger.
 *
 * Machine-to-machine entry point for AgentOps. Built so external
 * Claude tool-use (and any other automation) can trigger agent runs
 * without a browser session, while inheriting all of the IBE gates
 * shipped in Slice 5.5 — goal validation, scope enforcement, invariant
 * checks, separation-of-duties on writes.
 *
 * Auth: ApiKey with `agents_trigger` scope (X-MacTech-Audit-Key or
 *       Authorization: Bearer <key>). Issue + revoke at /admin/api-keys.
 *
 * Body:
 *   {
 *     request: string,                   // free-text fed to planner
 *     intent: {                          // REQUIRED for M2M
 *       goal: string,
 *       scopeAppIds: string[],
 *       scopeRepoIds: string[],
 *       invariants: { [capabilityKey]: string[] },
 *       riskTolerance: "strict" | "moderate" | "permissive"
 *     },
 *     autoExecute?: boolean              // default true; only for read-only plans
 *   }
 *
 * Responses:
 *   200 — { ok: true, runId, status, requiresApproval, planSummary,
 *           plannedStepCount, reviewUrl }
 *   401 — bad / missing key, or wrong scope
 *   422 — { ok: false, error: "intent_invalid", details: [...] }
 *   400 — { ok: false, error: "intent_required" | "request_required" | … }
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import {
  ExternalTriggerError,
  triggerExternalRun,
} from "@/lib/agents/external-trigger";
import type { Intent } from "@/lib/agents/intent/types";
import type { AgentRiskTolerance } from "@prisma/client";
import {
  appRegistryIdForKey,
  approxRequestBytes,
  recordAppCall,
  suiteAppRegistryId,
} from "@/lib/services/command-center/traffic-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const bytesIn = approxRequestBytes(request);

  // Helper closure attributes the call to a stable source label.
  const recordTraffic = async (
    statusCode: number,
    sourceLabel: string,
    apiKeyId: string | null,
  ) => {
    const [sourceId, targetId] = await Promise.all([
      appRegistryIdForKey(sourceLabel),
      suiteAppRegistryId(),
    ]);
    void recordAppCall({
      sourceLabel,
      sourceAppRegistryId: sourceId,
      targetAppRegistryId: targetId,
      endpoint: "/api/v1/agents/runs",
      method: "POST",
      statusCode,
      bytesIn,
      apiKeyId,
      durationMs: Date.now() - startedAt,
    });
  };

  const auth = await requireApiKey(request, "agents_trigger");
  if (!auth.ok) {
    void recordTraffic(401, "anonymous", null);
    return auth.response;
  }
  const sourceLabel = auth.apiKeyApp ?? auth.apiKeyName ?? "anonymous";

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    void recordTraffic(400, sourceLabel, auth.apiKeyId);
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const requestText = body.request;
  if (typeof requestText !== "string" || requestText.trim().length === 0) {
    void recordTraffic(400, sourceLabel, auth.apiKeyId);
    return NextResponse.json(
      { ok: false, error: "request_required" },
      { status: 400 },
    );
  }

  const intent = parseIntent(body.intent);
  if (!intent) {
    void recordTraffic(400, sourceLabel, auth.apiKeyId);
    return NextResponse.json(
      { ok: false, error: "intent_required" },
      { status: 400 },
    );
  }

  const autoExecute = body.autoExecute !== false;

  try {
    const out = await triggerExternalRun({
      request: requestText,
      intent,
      autoExecute,
      apiKeyId: auth.apiKeyId ?? "unknown",
      apiKeyName: auth.apiKeyName,
    });
    void recordTraffic(200, sourceLabel, auth.apiKeyId);
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    if (err instanceof ExternalTriggerError) {
      const status =
        err.code === "intent_invalid"
          ? 422
          : err.code === "execute_failed"
            ? 500
            : 400;
      void recordTraffic(status, sourceLabel, auth.apiKeyId);
      return NextResponse.json(
        { ok: false, error: err.code, details: err.details ?? [] },
        { status },
      );
    }
    void recordTraffic(500, sourceLabel, auth.apiKeyId);
    console.error("[api/v1/agents/runs]", err);
    return NextResponse.json({ ok: false, error: "trigger_failed" }, { status: 500 });
  }
}

function parseIntent(raw: unknown): Intent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const goal = typeof r.goal === "string" ? r.goal.trim() : "";
  if (!goal) return null;
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
  return { goal, scopeAppIds, scopeRepoIds, invariants, riskTolerance };
}
