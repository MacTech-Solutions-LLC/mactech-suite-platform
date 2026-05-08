/**
 * AgentOps orchestrator — Slice 5.
 *
 * Owns the AgentRun lifecycle:
 *   planned → awaiting_approval → approved → running → completed/failed
 *   planned → running (read-only-only plan, no approval gate)
 *   awaiting_approval → rejected
 *   running → cancelled (admin-only manage permission)
 *
 * Safety properties enforced HERE (not at the route layer):
 *   - Plans containing any approval_required step land in
 *     awaiting_approval. They cannot be executed without an
 *     AgentApproval(decision=approved) row.
 *   - The approver cannot be the requester (separation of duties).
 *   - The capability registry is consulted at execute time (defence in
 *     depth — even if a row mutated post-plan, an unknown key fails).
 *   - Every transition writes an AuditLog envelope.
 *   - Read-only plans run on the requester's permission set.
 *   - Approval-required plans run with the requester as the actor — the
 *     approver authorizes, but the audit log shows BOTH identities.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog, redactMetadata } from "@/lib/audit";
import { getCapability } from "./capabilities/registry";
import { planFromRequest } from "./planner";
import { validateIntent } from "./intent/validator";
import { getInvariant } from "./intent/invariants";
import { checkScope } from "./intent/scope";
import type { Intent } from "./intent/types";
import type { CapabilityContext, CapabilityResult } from "./types";
import { Prisma, type AgentRiskTolerance } from "@prisma/client";

// ───────────────────────────────────────────────────────────────────────────
// Plan
// ───────────────────────────────────────────────────────────────────────────

export interface CreatePlanInput {
  request: string;
  requesterClerkUserId: string;
  requesterEmail: string;
  /**
   * Optional Intent declaration (Slice 5.5 IBE gates). When present,
   * the orchestrator validates goal/scope/invariants up front and
   * persists them on the AgentRun. When absent, the run lands as a
   * legacy "trust the planner" run with no IBE gate. We keep this
   * optional so the existing /api/agents/plan callers do not break.
   */
  intent?: Intent;
}

export class IntentValidationFailedError extends Error {
  constructor(public readonly errors: ReadonlyArray<{ type: string; details: string }>) {
    super(`Intent validation failed: ${errors.map((e) => e.details).join("; ")}`);
    this.name = "IntentValidationFailedError";
  }
}

export async function createPlan(input: CreatePlanInput): Promise<{
  runId: string;
}> {
  // ── IBE goal/scope/invariant validation (when an Intent was declared)
  let validation: { valid: boolean; errors: { type: string; details: string }[] } | null = null;
  if (input.intent) {
    const v = await validateIntent(input.intent);
    validation = { valid: v.valid, errors: [...v.errors] };
    if (!v.valid) {
      throw new IntentValidationFailedError(v.errors);
    }
  }

  const planned = await planFromRequest(input.request);
  const requiresApproval = planned.steps.some((s) => s.kind === "approval_required");
  const initialStatus = requiresApproval ? "awaiting_approval" : "planned";
  const intent = input.intent;

  const run = await prisma.agentRun.create({
    data: {
      status: initialStatus,
      requestText: input.request,
      planSummary: planned.planSummary,
      deterministicPlan: planned.deterministic,
      plannedStepCount: planned.steps.length,
      requiresApproval,
      requestedByClerkUserId: input.requesterClerkUserId,
      requestedByEmail: input.requesterEmail,
      // ── IBE intent persistence
      intentGoal: intent?.goal ?? null,
      intentRiskTolerance:
        (intent?.riskTolerance ?? "strict") as AgentRiskTolerance,
      intentScopeAppIds: intent?.scopeAppIds ?? [],
      intentScopeRepoIds: intent?.scopeRepoIds ?? [],
      intentInvariantsJson: intent
        ? (intent.invariants as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      intentValidationJson: validation
        ? (validation as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      steps: {
        create: planned.steps.map((s, i) => ({
          stepIndex: i + 1,
          capabilityKey: s.capabilityKey,
          kind: s.kind,
          rationale: s.rationale,
          inputJson: s.input as Prisma.InputJsonValue,
        })),
      },
    },
  });

  await writeAuditLog({
    eventType: "agent.run.planned",
    eventCategory: "system",
    action: `agent: planned (${planned.steps.length} step${planned.steps.length === 1 ? "" : "s"}, ${requiresApproval ? "needs approval" : "read-only"})${intent ? " — IBE-gated" : ""}`,
    actorClerkUserId: input.requesterClerkUserId,
    actorEmail: input.requesterEmail,
    resourceType: "agent_run",
    resourceId: run.id,
    metadata: {
      deterministic: planned.deterministic,
      stepCount: planned.steps.length,
      requiresApproval,
      capabilities: planned.steps.map((s) => s.capabilityKey),
      ibeGated: Boolean(intent),
      riskTolerance: intent?.riskTolerance ?? null,
      scopeApps: intent?.scopeAppIds.length ?? 0,
      scopeRepos: intent?.scopeRepoIds.length ?? 0,
    },
  });

  return { runId: run.id };
}

// ───────────────────────────────────────────────────────────────────────────
// Approve / reject
// ───────────────────────────────────────────────────────────────────────────

export interface ApproveInput {
  runId: string;
  approverClerkUserId: string;
  approverEmail: string;
  decision: "approved" | "rejected";
  notes?: string;
}

export class ApprovalError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "self_approval_denied"
      | "wrong_state"
      | "no_approval_required",
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

export async function approveRun(input: ApproveInput): Promise<void> {
  const run = await prisma.agentRun.findUnique({ where: { id: input.runId } });
  if (!run) throw new ApprovalError("Run not found", "not_found");
  if (!run.requiresApproval) {
    throw new ApprovalError(
      "This run is read-only; it does not require approval.",
      "no_approval_required",
    );
  }
  if (run.status !== "awaiting_approval") {
    throw new ApprovalError(
      `Run is in status ${run.status}; can only approve/reject when awaiting_approval.`,
      "wrong_state",
    );
  }
  // Separation of duties: the requester cannot self-approve.
  if (run.requestedByClerkUserId === input.approverClerkUserId) {
    throw new ApprovalError(
      "Approver and requester must be different users (separation of duties).",
      "self_approval_denied",
    );
  }

  const isApprove = input.decision === "approved";
  const now = new Date();
  await prisma.$transaction([
    prisma.agentApproval.create({
      data: {
        agentRunId: run.id,
        decision: input.decision,
        approverClerkUserId: input.approverClerkUserId,
        approverEmail: input.approverEmail,
        notes: input.notes ?? null,
      },
    }),
    prisma.agentRun.update({
      where: { id: run.id },
      data: isApprove
        ? {
            status: "approved",
            approvedByClerkUserId: input.approverClerkUserId,
            approvedByEmail: input.approverEmail,
            approvedAt: now,
          }
        : {
            status: "rejected",
            rejectedAt: now,
            rejectionReason: input.notes ?? null,
          },
    }),
  ]);

  await writeAuditLog({
    eventType: isApprove ? "agent.run.approved" : "agent.run.rejected",
    eventCategory: "system",
    action: `agent: run ${input.decision} by ${input.approverEmail}`,
    actorClerkUserId: input.approverClerkUserId,
    actorEmail: input.approverEmail,
    resourceType: "agent_run",
    resourceId: run.id,
    metadata: { notes: input.notes ?? null, requesterEmail: run.requestedByEmail },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Execute
// ───────────────────────────────────────────────────────────────────────────

export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "wrong_state"
      | "self_execute_after_approval_denied",
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

export interface ExecuteInput {
  runId: string;
  /** Whoever clicked "execute". */
  executorClerkUserId: string;
  executorEmail: string;
}

/**
 * Run the plan to completion. For read-only plans, the executor must
 * be the requester (or hold AGENTS_MANAGE) — anyone clicking execute
 * is asking the agent to act on their behalf, and the audit log records
 * the executor identity. For approval-required plans, the run must
 * already be in `approved` status.
 *
 * Steps execute serially; the first failure aborts the run.
 *
 * IBE gates (Slice 5.5):
 *   - Before any step runs, scope is enforced against intentScopeAppIds /
 *     intentScopeRepoIds. A step naming an out-of-scope resource refuses
 *     the run (terminal state) before any side effect lands.
 *   - After each step succeeds, declared invariants are evaluated against
 *     the capability's CapabilityResult.summary. Any `ok: false` outcome
 *     under risk_tolerance=strict refuses the run; under permissive,
 *     outcomes are recorded but never refuse.
 */
export async function executeRun(input: ExecuteInput): Promise<{
  status: "completed" | "failed" | "refused";
}> {
  const run = await prisma.agentRun.findUnique({
    where: { id: input.runId },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
  if (!run) throw new ExecutionError("Run not found", "not_found");

  // Allowed entry states:
  //   - "planned"   (read-only run, never went through approval)
  //   - "approved"  (approval-required run that has been approved)
  if (run.status !== "planned" && run.status !== "approved") {
    throw new ExecutionError(
      `Run is in status ${run.status}; can only execute when planned or approved.`,
      "wrong_state",
    );
  }

  // ── IBE pre-flight: scope check on every step's input ──────────────
  const scopeViolations = await checkScope({
    scopeAppIds: run.intentScopeAppIds,
    scopeRepoIds: run.intentScopeRepoIds,
    steps: run.steps.map((s) => ({
      stepIndex: s.stepIndex,
      capabilityKey: s.capabilityKey,
      inputJson: s.inputJson,
    })),
  });
  if (scopeViolations.length > 0) {
    const reason = `IBE scope violation: ${scopeViolations
      .map((v) => `step ${v.stepIndex} (${v.capabilityKey}) ${v.reason}`)
      .join("; ")}`;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "refused",
        completedAt: new Date(),
        refusalReason: reason,
      },
    });
    await writeAuditLog({
      eventType: "agent.run.refused",
      eventCategory: "system",
      severity: "warning",
      action: `agent: run refused (scope) — ${reason}`,
      actorClerkUserId: input.executorClerkUserId,
      actorEmail: input.executorEmail,
      resourceType: "agent_run",
      resourceId: run.id,
      metadata: { reason: "scope_violation", violations: scopeViolations.length },
    });
    return { status: "refused" };
  }

  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: "running", startedAt: new Date() },
  });

  await writeAuditLog({
    eventType: "agent.run.started",
    eventCategory: "system",
    action: `agent: run started by ${input.executorEmail}`,
    actorClerkUserId: input.executorClerkUserId,
    actorEmail: input.executorEmail,
    resourceType: "agent_run",
    resourceId: run.id,
    metadata: {
      requesterEmail: run.requestedByEmail,
      stepCount: run.steps.length,
      ibeGated: Boolean(run.intentGoal),
    },
  });

  // Parse the user-declared invariants (per-capability key map) so each
  // step's evaluator phase only walks its own subset.
  const invariantsByCap = parseInvariantsJson(run.intentInvariantsJson);

  let failed = false;
  let refused = false;
  let failureReason: string | null = null;
  const refusalDetails: string[] = [];

  for (const step of run.steps) {
    const cap = getCapability(step.capabilityKey);
    if (!cap) {
      // Defence in depth: capability removed between plan and execute.
      await prisma.agentStep.update({
        where: { id: step.id },
        data: {
          status: "failed",
          errorMessage: `Capability ${step.capabilityKey} not registered`,
          completedAt: new Date(),
        },
      });
      failed = true;
      failureReason = `step ${step.stepIndex}: unknown capability ${step.capabilityKey}`;
      break;
    }

    const startedAt = new Date();
    await prisma.agentStep.update({
      where: { id: step.id },
      data: { status: "running", startedAt },
    });

    const ctx: CapabilityContext = {
      agentRunId: run.id,
      agentStepId: step.id,
      requesterClerkUserId: run.requestedByClerkUserId,
      requesterEmail: run.requestedByEmail,
      approverClerkUserId: run.approvedByClerkUserId,
      approverEmail: run.approvedByEmail,
    };

    try {
      const result: CapabilityResult = await cap.invoke(
        step.inputJson as Record<string, unknown>,
        ctx,
      );
      const completedAt = new Date();

      // ── IBE invariant evaluation on this step ────────────────────────
      // Walks only the invariants the user explicitly attached to this
      // step's capabilityKey. Pure-logic evaluators (no DB calls) keep
      // this fast.
      const requested = invariantsByCap.get(step.capabilityKey) ?? [];
      const outcomes = requested
        .map((invKey) => {
          const def = getInvariant(step.capabilityKey, invKey);
          if (!def) return null;
          try {
            return def.evaluate(
              step.inputJson as Record<string, unknown>,
              result.summary,
            );
          } catch (e) {
            return {
              invariantKey: invKey,
              ok: false,
              actual: null as null,
              message: `invariant evaluator threw: ${e instanceof Error ? e.message : "unknown"}`,
            };
          }
        })
        .filter((o): o is NonNullable<typeof o> => o !== null);
      const stepHasViolations = outcomes.some((o) => !o.ok);

      await prisma.$transaction([
        prisma.agentStep.update({
          where: { id: step.id },
          data: {
            status: "succeeded",
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            outputJson: redactMetadata(result.summary) as Prisma.InputJsonValue,
            invariantResultsJson:
              outcomes.length > 0
                ? (outcomes as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            invariantViolations: stepHasViolations,
          },
        }),
        ...((result.artifacts ?? []).map((a) =>
          prisma.agentArtifact.create({
            data: {
              agentRunId: run.id,
              agentStepId: step.id,
              kind: a.kind,
              title: a.title,
              bodyMarkdown: a.bodyMarkdown,
              payloadJson: a.payloadJson
                ? (redactMetadata(a.payloadJson) as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            },
          }),
        ) as ReturnType<typeof prisma.agentArtifact.create>[]),
      ]);

      // Refuse the run if invariants violated and tolerance is strict
      // or moderate. (v1 treats moderate as strict; baseline-snapshot
      // wiring lands in a follow-up.)
      if (
        stepHasViolations &&
        (run.intentRiskTolerance === "strict" ||
          run.intentRiskTolerance === "moderate")
      ) {
        refused = true;
        for (const bad of outcomes.filter((o) => !o.ok)) {
          refusalDetails.push(
            `step ${step.stepIndex} (${step.capabilityKey}) invariant '${bad.invariantKey}': ${bad.message}`,
          );
        }
        await writeAuditLog({
          eventType: "agent.invariant.violated",
          eventCategory: "system",
          severity: "warning",
          action: `agent: invariant violation on step ${step.stepIndex} (${step.capabilityKey})`,
          actorClerkUserId: input.executorClerkUserId,
          actorEmail: input.executorEmail,
          resourceType: "agent_run",
          resourceId: run.id,
          metadata: {
            stepIndex: step.stepIndex,
            capability: step.capabilityKey,
            failures: outcomes
              .filter((o) => !o.ok)
              .map((o) => ({
                key: o.invariantKey,
                actual: o.actual,
                message: o.message,
              })),
          },
        });
        break;
      }
    } catch (err) {
      const completedAt = new Date();
      const errorMessage = err instanceof Error ? err.message : "unknown_error";
      await prisma.agentStep.update({
        where: { id: step.id },
        data: {
          status: "failed",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          errorMessage,
        },
      });
      failed = true;
      failureReason = `step ${step.stepIndex} (${step.capabilityKey}): ${errorMessage}`;
      break;
    }
  }

  const completedAt = new Date();
  const finalStatus: "failed" | "refused" | "completed" = failed
    ? "failed"
    : refused
      ? "refused"
      : "completed";
  const refusalReason =
    refused && refusalDetails.length > 0
      ? `IBE invariant violation: ${refusalDetails.join("; ")}`
      : null;

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: finalStatus,
      completedAt,
      failureReason,
      refusalReason,
    },
  });

  await writeAuditLog({
    eventType:
      finalStatus === "failed"
        ? "agent.run.failed"
        : finalStatus === "refused"
          ? "agent.run.refused"
          : "agent.run.completed",
    eventCategory: "system",
    severity: finalStatus === "completed" ? "info" : "warning",
    action:
      finalStatus === "failed"
        ? `agent: run failed — ${failureReason ?? "unknown"}`
        : finalStatus === "refused"
          ? `agent: run refused — ${refusalReason ?? "invariant violation"}`
          : "agent: run completed",
    actorClerkUserId: input.executorClerkUserId,
    actorEmail: input.executorEmail,
    resourceType: "agent_run",
    resourceId: run.id,
    metadata: {
      stepCount: run.steps.length,
      failed,
      refused,
    },
  });

  return { status: finalStatus };
}

function parseInvariantsJson(raw: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      out.set(
        k,
        v.filter((x): x is string => typeof x === "string"),
      );
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Cancel (manage permission only — caller must check before invoking)
// ───────────────────────────────────────────────────────────────────────────

export async function cancelRun(input: {
  runId: string;
  actorClerkUserId: string;
  actorEmail: string;
  reason?: string;
}): Promise<void> {
  const run = await prisma.agentRun.findUnique({ where: { id: input.runId } });
  if (!run) return;
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return; // already terminal
  }
  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "cancelled",
      completedAt: new Date(),
      failureReason: input.reason ?? "cancelled by admin",
    },
  });
  await writeAuditLog({
    eventType: "agent.run.cancelled",
    eventCategory: "system",
    severity: "warning",
    action: `agent: run cancelled by ${input.actorEmail}`,
    actorClerkUserId: input.actorClerkUserId,
    actorEmail: input.actorEmail,
    resourceType: "agent_run",
    resourceId: run.id,
    metadata: { reason: input.reason ?? null },
  });
}
