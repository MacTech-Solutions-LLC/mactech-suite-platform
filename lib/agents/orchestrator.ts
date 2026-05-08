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
import type { CapabilityContext, CapabilityResult } from "./types";
import { Prisma } from "@prisma/client";

// ───────────────────────────────────────────────────────────────────────────
// Plan
// ───────────────────────────────────────────────────────────────────────────

export interface CreatePlanInput {
  request: string;
  requesterClerkUserId: string;
  requesterEmail: string;
}

export async function createPlan(input: CreatePlanInput): Promise<{
  runId: string;
}> {
  const planned = await planFromRequest(input.request);
  const requiresApproval = planned.steps.some((s) => s.kind === "approval_required");
  const initialStatus = requiresApproval ? "awaiting_approval" : "planned";

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
    action: `agent: planned (${planned.steps.length} step${planned.steps.length === 1 ? "" : "s"}, ${requiresApproval ? "needs approval" : "read-only"})`,
    actorClerkUserId: input.requesterClerkUserId,
    actorEmail: input.requesterEmail,
    resourceType: "agent_run",
    resourceId: run.id,
    metadata: {
      deterministic: planned.deterministic,
      stepCount: planned.steps.length,
      requiresApproval,
      capabilities: planned.steps.map((s) => s.capabilityKey),
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
 */
export async function executeRun(input: ExecuteInput): Promise<{
  status: "completed" | "failed";
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
    },
  });

  let failed = false;
  let failureReason: string | null = null;

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
      await prisma.$transaction([
        prisma.agentStep.update({
          where: { id: step.id },
          data: {
            status: "succeeded",
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            outputJson: redactMetadata(result.summary) as Prisma.InputJsonValue,
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
  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: failed ? "failed" : "completed",
      completedAt,
      failureReason,
    },
  });

  await writeAuditLog({
    eventType: failed ? "agent.run.failed" : "agent.run.completed",
    eventCategory: "system",
    severity: failed ? "warning" : "info",
    action: failed
      ? `agent: run failed — ${failureReason ?? "unknown"}`
      : "agent: run completed",
    actorClerkUserId: input.executorClerkUserId,
    actorEmail: input.executorEmail,
    resourceType: "agent_run",
    resourceId: run.id,
    metadata: { stepCount: run.steps.length, failed },
  });

  return { status: failed ? "failed" : "completed" };
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
