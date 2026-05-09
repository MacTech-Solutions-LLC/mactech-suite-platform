/**
 * AgentTrigger CRUD service — Slice 5.8.
 *
 * All public entrypoints re-check AGENTS_CREATE inside the service
 * (defence in depth — the route layer also checks). Every mutation
 * writes an audit row.
 *
 * Validation:
 *   - Cron expression is parsed at create + update time. An invalid
 *     expression rejects the operation (no "soft fail" — the trigger
 *     would never fire and we'd silently lose the schedule).
 *   - Intent goal/scope/invariants are NOT validated here at save
 *     time, because scope ids may change between save and fire (an
 *     app gets retired, a repo gets archived). Instead the IBE
 *     validator runs at fire time, and a failed validation marks the
 *     fire as a refusal — not a crash.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { parseCronExpression, nextFireTime } from "./scheduler";
import { getThresholdMetric } from "./threshold-metrics";
import type { Intent } from "./intent/types";
import type {
  AgentTrigger,
  AgentTriggerKind,
  Prisma,
  ThresholdOperator,
} from "@prisma/client";

export interface SaveTriggerInput {
  name: string;
  description?: string;
  /** Slice 9: cron (default) or threshold. */
  kind?: AgentTriggerKind;
  /** Required when kind=cron. Ignored when kind=threshold. */
  cronExpression?: string;
  timezone?: string;
  request: string;
  intent: Intent;
  autoExecute?: boolean;
  enabled?: boolean;
  // ── Slice 9: required when kind=threshold ──────────────────────────
  thresholdMetric?: string;
  thresholdOperator?: ThresholdOperator;
  thresholdValue?: number;
  cooldownMinutes?: number;
}

export class TriggerValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "name_required"
      | "cron_invalid"
      | "request_required"
      | "intent_required"
      | "threshold_invalid",
  ) {
    super(message);
    this.name = "TriggerValidationError";
  }
}

export async function listTriggers(): Promise<AgentTrigger[]> {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_VIEW);
  return prisma.agentTrigger.findMany({
    orderBy: [{ enabled: "desc" }, { name: "asc" }],
  });
}

export async function getTrigger(id: string): Promise<AgentTrigger | null> {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_VIEW);
  return prisma.agentTrigger.findUnique({ where: { id } });
}

export async function createTrigger(input: SaveTriggerInput): Promise<AgentTrigger> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  validateInput(input);

  const kind = input.kind ?? "cron";
  const tz = input.timezone ?? "UTC";
  // Cron triggers compute their next fire time up front. Threshold
  // triggers evaluate on every tick, so nextFireAt stays null.
  const next =
    kind === "cron" && input.cronExpression
      ? nextFireTime(input.cronExpression, tz)
      : null;

  const trigger = await prisma.agentTrigger.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      enabled: input.enabled ?? true,
      kind,
      cronExpression: kind === "cron" ? (input.cronExpression?.trim() ?? null) : null,
      timezone: tz,
      request: input.request.trim(),
      intentJson: input.intent as unknown as Prisma.InputJsonValue,
      autoExecute: input.autoExecute ?? true,
      nextFireAt: next,
      thresholdMetric: kind === "threshold" ? (input.thresholdMetric ?? null) : null,
      thresholdOperator:
        kind === "threshold" ? (input.thresholdOperator ?? null) : null,
      thresholdValue: kind === "threshold" ? (input.thresholdValue ?? null) : null,
      cooldownMinutes: input.cooldownMinutes ?? 60,
      createdByClerkUserId: ctx.clerkUserId,
      createdByEmail: ctx.userProfile.email,
    },
  });

  await writeAuditLog({
    eventType: "agent.trigger.created",
    eventCategory: "system",
    action:
      kind === "cron"
        ? `agent: trigger created — '${trigger.name}' (cron ${trigger.cronExpression} ${trigger.timezone})`
        : `agent: trigger created — '${trigger.name}' (threshold ${trigger.thresholdMetric} ${trigger.thresholdOperator} ${trigger.thresholdValue})`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    resourceType: "agent_trigger",
    resourceId: trigger.id,
    metadata: {
      kind,
      cronExpression: trigger.cronExpression,
      timezone: trigger.timezone,
      autoExecute: trigger.autoExecute,
      nextFireAt: trigger.nextFireAt?.toISOString() ?? null,
      thresholdMetric: trigger.thresholdMetric,
      thresholdOperator: trigger.thresholdOperator,
      thresholdValue: trigger.thresholdValue,
      cooldownMinutes: trigger.cooldownMinutes,
    },
  });
  return trigger;
}

export async function updateTrigger(
  id: string,
  input: SaveTriggerInput,
): Promise<AgentTrigger> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  validateInput(input);

  const existing = await prisma.agentTrigger.findUnique({ where: { id } });
  if (!existing) throw new TriggerValidationError("trigger not found", "name_required");

  const kind = input.kind ?? existing.kind;
  const tz = input.timezone ?? existing.timezone;
  const next =
    kind === "cron" && input.cronExpression
      ? nextFireTime(input.cronExpression, tz)
      : null;

  const trigger = await prisma.agentTrigger.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      enabled: input.enabled ?? existing.enabled,
      kind,
      cronExpression: kind === "cron" ? (input.cronExpression?.trim() ?? null) : null,
      timezone: tz,
      request: input.request.trim(),
      intentJson: input.intent as unknown as Prisma.InputJsonValue,
      autoExecute: input.autoExecute ?? existing.autoExecute,
      nextFireAt: next,
      thresholdMetric: kind === "threshold" ? (input.thresholdMetric ?? null) : null,
      thresholdOperator:
        kind === "threshold" ? (input.thresholdOperator ?? null) : null,
      thresholdValue: kind === "threshold" ? (input.thresholdValue ?? null) : null,
      cooldownMinutes: input.cooldownMinutes ?? existing.cooldownMinutes,
      // Reset rising-edge state on edit so a stuck-true condition can
      // fire fresh under the new threshold.
      thresholdConditionMet: false,
      // Reset the failure counter when the operator edits — they have
      // made a deliberate change, give it a fresh chance.
      consecutiveFailures: 0,
    },
  });

  await writeAuditLog({
    eventType: "agent.trigger.updated",
    eventCategory: "system",
    action: `agent: trigger updated — '${trigger.name}' (kind=${kind})`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    resourceType: "agent_trigger",
    resourceId: trigger.id,
    metadata: {
      kind,
      cronExpression: trigger.cronExpression,
      timezone: trigger.timezone,
      autoExecute: trigger.autoExecute,
      enabled: trigger.enabled,
      thresholdMetric: trigger.thresholdMetric,
      thresholdOperator: trigger.thresholdOperator,
      thresholdValue: trigger.thresholdValue,
      cooldownMinutes: trigger.cooldownMinutes,
    },
  });
  return trigger;
}

export async function deleteTrigger(id: string): Promise<void> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  const existing = await prisma.agentTrigger.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.agentTrigger.delete({ where: { id } });
  await writeAuditLog({
    eventType: "agent.trigger.deleted",
    eventCategory: "system",
    severity: "warning",
    action: `agent: trigger deleted — '${existing.name}'`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    resourceType: "agent_trigger",
    resourceId: existing.id,
    metadata: { cronExpression: existing.cronExpression },
  });
}

export async function setTriggerEnabled(id: string, enabled: boolean): Promise<AgentTrigger> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  const existing = await prisma.agentTrigger.findUnique({ where: { id } });
  if (!existing) throw new TriggerValidationError("trigger not found", "name_required");

  // When re-enabling, recompute nextFireAt off the current time so a
  // long-disabled trigger doesn't fire instantly with stale schedule.
  // Threshold triggers don't have a cronExpression — they evaluate
  // every tick instead, so nextFireAt stays null for them.
  const next =
    enabled && existing.kind === "cron" && existing.cronExpression
      ? nextFireTime(existing.cronExpression, existing.timezone)
      : null;
  const trigger = await prisma.agentTrigger.update({
    where: { id },
    data: { enabled, nextFireAt: next, consecutiveFailures: enabled ? 0 : existing.consecutiveFailures },
  });
  await writeAuditLog({
    eventType: enabled ? "agent.trigger.enabled" : "agent.trigger.disabled",
    eventCategory: "system",
    action: `agent: trigger ${enabled ? "enabled" : "disabled"} — '${trigger.name}'`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    resourceType: "agent_trigger",
    resourceId: trigger.id,
  });
  return trigger;
}

function validateInput(input: SaveTriggerInput): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new TriggerValidationError("trigger name is required", "name_required");
  }
  if (!input.request || input.request.trim().length === 0) {
    throw new TriggerValidationError("request is required", "request_required");
  }
  if (!input.intent || !input.intent.goal || input.intent.goal.trim().length === 0) {
    throw new TriggerValidationError(
      "intent.goal is required for triggers",
      "intent_required",
    );
  }
  const kind = input.kind ?? "cron";
  if (kind === "cron") {
    if (!input.cronExpression) {
      throw new TriggerValidationError(
        "cronExpression is required when kind=cron",
        "cron_invalid",
      );
    }
    const parsed = parseCronExpression(input.cronExpression, input.timezone ?? "UTC");
    if (!parsed.ok) {
      throw new TriggerValidationError(`cron: ${parsed.error}`, "cron_invalid");
    }
  } else if (kind === "threshold") {
    if (!input.thresholdMetric) {
      throw new TriggerValidationError(
        "thresholdMetric is required when kind=threshold",
        "threshold_invalid",
      );
    }
    if (!getThresholdMetric(input.thresholdMetric)) {
      throw new TriggerValidationError(
        `unknown thresholdMetric '${input.thresholdMetric}'`,
        "threshold_invalid",
      );
    }
    if (!input.thresholdOperator) {
      throw new TriggerValidationError(
        "thresholdOperator is required when kind=threshold",
        "threshold_invalid",
      );
    }
    if (input.thresholdValue == null || !Number.isFinite(input.thresholdValue)) {
      throw new TriggerValidationError(
        "thresholdValue is required and must be a finite number when kind=threshold",
        "threshold_invalid",
      );
    }
    if (input.cooldownMinutes != null && input.cooldownMinutes < 0) {
      throw new TriggerValidationError(
        "cooldownMinutes cannot be negative",
        "threshold_invalid",
      );
    }
  }
}
