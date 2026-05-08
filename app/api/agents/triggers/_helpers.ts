/**
 * Shared helpers for the trigger CRUD route handlers. Lives outside
 * route.ts because Next.js forbids non-route exports from a route
 * file. The leading underscore in the directory name keeps it from
 * being mistaken for a route segment by the App Router.
 */

import { NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/authz";
import {
  TriggerValidationError,
  type SaveTriggerInput,
} from "@/lib/agents/triggers-service";
import type { Intent } from "@/lib/agents/intent/types";
import type { AgentRiskTolerance } from "@prisma/client";

export function parseSaveInput(body: Record<string, unknown>): SaveTriggerInput | null {
  const name = typeof body.name === "string" ? body.name : "";
  const cronExpression = typeof body.cronExpression === "string" ? body.cronExpression : "";
  const request = typeof body.request === "string" ? body.request : "";
  const intent = parseIntent(body.intent);
  if (!name || !cronExpression || !request || !intent) return null;
  return {
    name,
    cronExpression,
    request,
    intent,
    description: typeof body.description === "string" ? body.description : undefined,
    timezone: typeof body.timezone === "string" ? body.timezone : undefined,
    autoExecute: typeof body.autoExecute === "boolean" ? body.autoExecute : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  };
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

export function handleError(err: unknown) {
  if (err instanceof AuthorizationError) {
    const status =
      err.code === "unauthenticated"
        ? 401
        : err.code === "permission_denied" || err.code === "no_platform_access"
          ? 403
          : 400;
    return NextResponse.json({ ok: false, error: err.code }, { status });
  }
  if (err instanceof TriggerValidationError) {
    return NextResponse.json(
      { ok: false, error: err.code, message: err.message },
      { status: 422 },
    );
  }
  console.error("[api/agents/triggers]", err);
  return NextResponse.json({ ok: false, error: "trigger_op_failed" }, { status: 500 });
}
