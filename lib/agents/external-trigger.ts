/**
 * External AgentOps trigger — Slice 5.7.
 *
 * Entry point for machine-to-machine callers (Claude tool use,
 * Anthropic API automations, sibling apps). The IBE gates from Slice
 * 5.5 do the safety work: every M2M call MUST carry an Intent, the
 * orchestrator validates goal/scope/invariants up front, and writes
 * are still gated behind a human approval in /admin/agents/[id].
 *
 * Safety contract:
 *   - Auth is handled at the route layer via lib/api-auth (existing
 *     scoped ApiKey infrastructure). The route only reaches this
 *     service after a key with `agents_trigger` scope has been
 *     verified.
 *   - The "requester" identity for M2M runs is synthetic:
 *     clerkUserId  = `api-key:<id>`,
 *     email        = `<keyName>@api.mactech`.
 *     This guarantees the requester id can never collide with a Clerk
 *     admin id, so separation of duties is preserved on approval.
 *   - Read-only-only plans auto-execute. Plans containing any
 *     approval_required step land in `awaiting_approval` and the M2M
 *     caller is told to point a human at the run detail URL.
 *   - Intent is REQUIRED for M2M (unlike browser callers, which can
 *     opt in). Refusing M2M without an Intent eliminates the
 *     "free-text trust" surface.
 */

import { prisma } from "@/lib/db/prisma";
import {
  createPlan,
  executeRun,
  IntentValidationFailedError,
} from "./orchestrator";
import type { Intent } from "./intent/types";
import type { AgentRunStatus } from "@prisma/client";

export interface ExternalTriggerInput {
  /** Free-text request fed to the planner. */
  request: string;
  /** Required IBE Intent contract. M2M callers cannot skip this. */
  intent: Intent;
  /**
   * Whether to auto-execute when the resulting plan is fully
   * read-only. Defaults to true — that's the M2M happy path.
   */
  autoExecute?: boolean;
  /** Authenticated ApiKey identity from the route layer. */
  apiKeyId: string;
  apiKeyName: string;
}

export interface ExternalTriggerResult {
  runId: string;
  /** Status after this call returns. */
  status: AgentRunStatus;
  /** True when the plan needs a browser approval gate. */
  requiresApproval: boolean;
  /** Browser URL where a human can review/approve/execute. */
  reviewUrl: string;
  /** Human-readable plan summary the planner produced. */
  planSummary: string | null;
  plannedStepCount: number;
}

export class ExternalTriggerError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "intent_required"
      | "request_required"
      | "request_too_long"
      | "intent_invalid"
      | "execute_failed",
    public readonly details?: ReadonlyArray<{ type: string; details: string }>,
  ) {
    super(message);
    this.name = "ExternalTriggerError";
  }
}

export async function triggerExternalRun(
  input: ExternalTriggerInput,
): Promise<ExternalTriggerResult> {
  // Hard requirements — fail before touching the planner.
  if (typeof input.request !== "string" || input.request.trim().length === 0) {
    throw new ExternalTriggerError("request is required", "request_required");
  }
  if (input.request.length > 4000) {
    throw new ExternalTriggerError("request is too long", "request_too_long");
  }
  if (!input.intent || typeof input.intent.goal !== "string" || !input.intent.goal.trim()) {
    throw new ExternalTriggerError(
      "intent.goal is required for M2M callers",
      "intent_required",
    );
  }

  // Synthesize a non-Clerk requester identity. The orchestrator's
  // separation-of-duties check (requester ≠ approver) is keyed on
  // clerkUserId, so prefixing with "api-key:" guarantees no collision.
  const requesterClerkUserId = `api-key:${input.apiKeyId}`;
  const requesterEmail = `${slug(input.apiKeyName)}@api.mactech`;

  let plan: { runId: string };
  try {
    plan = await createPlan({
      request: input.request.trim(),
      requesterClerkUserId,
      requesterEmail,
      intent: input.intent,
      triggeredByApiKeyId: input.apiKeyId,
      triggeredByApiKeyName: input.apiKeyName,
    });
  } catch (err) {
    if (err instanceof IntentValidationFailedError) {
      throw new ExternalTriggerError(
        "intent failed validation",
        "intent_invalid",
        err.errors,
      );
    }
    throw err;
  }

  const created = await prisma.agentRun.findUniqueOrThrow({
    where: { id: plan.runId },
    select: {
      id: true,
      status: true,
      requiresApproval: true,
      planSummary: true,
      plannedStepCount: true,
    },
  });

  // Auto-execute read-only-only plans by default. Approval-required
  // plans bounce to a human via the review URL — the M2M caller cannot
  // skip the approval gate, even with the trigger scope.
  const autoExecute = input.autoExecute !== false;
  let finalStatus: AgentRunStatus = created.status;
  if (autoExecute && !created.requiresApproval && created.status === "planned") {
    try {
      const out = await executeRun({
        runId: created.id,
        executorClerkUserId: requesterClerkUserId,
        executorEmail: requesterEmail,
      });
      finalStatus = out.status as AgentRunStatus;
    } catch (err) {
      throw new ExternalTriggerError(
        err instanceof Error ? err.message : "execute_failed",
        "execute_failed",
      );
    }
  }

  return {
    runId: created.id,
    status: finalStatus,
    requiresApproval: created.requiresApproval,
    planSummary: created.planSummary,
    plannedStepCount: created.plannedStepCount,
    reviewUrl: `/admin/agents/${created.id}`,
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "key";
}
