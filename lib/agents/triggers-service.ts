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
import type { Intent } from "./intent/types";
import type { AgentTrigger, Prisma } from "@prisma/client";

export interface SaveTriggerInput {
  name: string;
  description?: string;
  cronExpression: string;
  timezone?: string;
  request: string;
  intent: Intent;
  autoExecute?: boolean;
  enabled?: boolean;
}

export class TriggerValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "name_required"
      | "cron_invalid"
      | "request_required"
      | "intent_required",
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

  const tz = input.timezone ?? "UTC";
  const next = nextFireTime(input.cronExpression, tz);

  const trigger = await prisma.agentTrigger.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      enabled: input.enabled ?? true,
      cronExpression: input.cronExpression.trim(),
      timezone: tz,
      request: input.request.trim(),
      intentJson: input.intent as unknown as Prisma.InputJsonValue,
      autoExecute: input.autoExecute ?? true,
      nextFireAt: next,
      createdByClerkUserId: ctx.clerkUserId,
      createdByEmail: ctx.userProfile.email,
    },
  });

  await writeAuditLog({
    eventType: "agent.trigger.created",
    eventCategory: "system",
    action: `agent: trigger created — '${trigger.name}' (${trigger.cronExpression} ${trigger.timezone})`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    resourceType: "agent_trigger",
    resourceId: trigger.id,
    metadata: {
      cronExpression: trigger.cronExpression,
      timezone: trigger.timezone,
      autoExecute: trigger.autoExecute,
      nextFireAt: trigger.nextFireAt?.toISOString() ?? null,
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

  const tz = input.timezone ?? existing.timezone;
  const next = nextFireTime(input.cronExpression, tz);

  const trigger = await prisma.agentTrigger.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      enabled: input.enabled ?? existing.enabled,
      cronExpression: input.cronExpression.trim(),
      timezone: tz,
      request: input.request.trim(),
      intentJson: input.intent as unknown as Prisma.InputJsonValue,
      autoExecute: input.autoExecute ?? existing.autoExecute,
      nextFireAt: next,
      // Reset the failure counter when the operator edits — they have
      // made a deliberate change, give it a fresh chance.
      consecutiveFailures: 0,
    },
  });

  await writeAuditLog({
    eventType: "agent.trigger.updated",
    eventCategory: "system",
    action: `agent: trigger updated — '${trigger.name}'`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    resourceType: "agent_trigger",
    resourceId: trigger.id,
    metadata: {
      cronExpression: trigger.cronExpression,
      timezone: trigger.timezone,
      autoExecute: trigger.autoExecute,
      enabled: trigger.enabled,
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
  const next = enabled ? nextFireTime(existing.cronExpression, existing.timezone) : null;
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
  const parsed = parseCronExpression(input.cronExpression, input.timezone ?? "UTC");
  if (!parsed.ok) {
    throw new TriggerValidationError(`cron: ${parsed.error}`, "cron_invalid");
  }
}
