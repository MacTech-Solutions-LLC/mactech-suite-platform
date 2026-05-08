/**
 * AgentTrigger scheduler — Slice 5.8.
 *
 * Two responsibilities:
 *   1. Validate + parse cron expressions at create/update time.
 *   2. Fire all due triggers when the cron tick endpoint is poked
 *      (POST /api/cron/agent-triggers, gated by CRON_SECRET).
 *
 * Each fire is just a saved IBE-gated Intent driven through the same
 * external-trigger service the M2M endpoint uses (slice 5.7). The
 * synthetic requester identity is `cron:<triggerId>` — guaranteed not
 * to collide with any Clerk admin id, so separation-of-duties holds
 * on any approval-required runs that get queued.
 *
 * Defensive choices:
 *   - The scheduler advances `nextFireAt` BEFORE firing, so a fire
 *     that throws cannot wedge the trigger in a "perpetually due"
 *     state (which would re-fire on every cron tick).
 *   - `consecutiveFailures` tracks failure streaks; the management UI
 *     surfaces this so an operator can disable a stuck trigger.
 *   - Each fire is wrapped in try/catch — one bad trigger does not
 *     poison the rest of the tick.
 *   - The cron expression is re-validated at fire time, not just at
 *     create time, so a schema migration that changes the parser does
 *     not silently misroute fires.
 */

import parser from "cron-parser";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { triggerExternalRun, ExternalTriggerError } from "./external-trigger";
import type { Intent } from "./intent/types";
import type { AgentTrigger, AgentRunStatus } from "@prisma/client";

// ───────────────────────────────────────────────────────────────────────────
// Cron expression utilities
// ───────────────────────────────────────────────────────────────────────────

export interface CronParseOk {
  ok: true;
  /** ISO 8601 string of the next fire time computed against the given tz. */
  nextAt: string;
}
export interface CronParseErr {
  ok: false;
  error: string;
}

export function parseCronExpression(
  expr: string,
  timezone: string = "UTC",
  from: Date = new Date(),
): CronParseOk | CronParseErr {
  try {
    const it = parser.parseExpression(expr, {
      currentDate: from,
      tz: timezone,
    });
    const next = it.next();
    return { ok: true, nextAt: next.toDate().toISOString() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "invalid_cron_expression",
    };
  }
}

/** Compute the next fire time after `from`, returning a Date or null on error. */
export function nextFireTime(
  expr: string,
  timezone: string,
  from: Date = new Date(),
): Date | null {
  try {
    const it = parser.parseExpression(expr, {
      currentDate: from,
      tz: timezone,
    });
    return it.next().toDate();
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Tick handler — fires all due triggers.
// ───────────────────────────────────────────────────────────────────────────

export interface TickOutcome {
  fired: number;
  skipped: number;
  errors: number;
  details: Array<{
    triggerId: string;
    name: string;
    status: "fired" | "skipped" | "error";
    runId?: string;
    runStatus?: AgentRunStatus;
    requiresApproval?: boolean;
    error?: string;
  }>;
}

export async function runCronTick(now: Date = new Date()): Promise<TickOutcome> {
  const due = await prisma.agentTrigger.findMany({
    where: {
      enabled: true,
      nextFireAt: { lte: now },
    },
    orderBy: { nextFireAt: "asc" },
    take: 100, // bound the per-tick work; subsequent ticks pick up the rest
  });

  const out: TickOutcome = { fired: 0, skipped: 0, errors: 0, details: [] };

  for (const trigger of due) {
    // Advance nextFireAt FIRST so a fire that throws does not re-fire
    // on the next tick.
    const next = nextFireTime(trigger.cronExpression, trigger.timezone, now);
    if (!next) {
      out.skipped += 1;
      out.details.push({
        triggerId: trigger.id,
        name: trigger.name,
        status: "skipped",
        error: "invalid cron expression",
      });
      await prisma.agentTrigger.update({
        where: { id: trigger.id },
        data: {
          nextFireAt: null,
          enabled: false,
          consecutiveFailures: trigger.consecutiveFailures + 1,
        },
      });
      continue;
    }

    await prisma.agentTrigger.update({
      where: { id: trigger.id },
      data: { nextFireAt: next, lastFiredAt: now },
    });

    try {
      const result = await fireTrigger(trigger, "cron");
      out.fired += 1;
      out.details.push({
        triggerId: trigger.id,
        name: trigger.name,
        status: "fired",
        runId: result.runId,
        runStatus: result.runStatus,
        requiresApproval: result.requiresApproval,
      });
      await prisma.agentTrigger.update({
        where: { id: trigger.id },
        data: {
          lastRunId: result.runId,
          lastRunStatus: result.runStatus,
          consecutiveFailures: 0,
        },
      });
    } catch (err) {
      out.errors += 1;
      const message = err instanceof Error ? err.message : "unknown_error";
      out.details.push({
        triggerId: trigger.id,
        name: trigger.name,
        status: "error",
        error: message,
      });
      await prisma.agentTrigger.update({
        where: { id: trigger.id },
        data: { consecutiveFailures: trigger.consecutiveFailures + 1 },
      });
      await writeAuditLog({
        eventType: "agent.trigger.fire_failed",
        eventCategory: "system",
        severity: "warning",
        action: `agent: trigger '${trigger.name}' fire failed — ${message}`,
        resourceType: "agent_trigger",
        resourceId: trigger.id,
        metadata: { reason: message, source: "cron" },
      });
    }
  }

  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Single-trigger fire — used by both the cron tick and the manual
// "fire now" button on the management UI.
// ───────────────────────────────────────────────────────────────────────────

export interface FireOutcome {
  runId: string;
  runStatus: AgentRunStatus;
  requiresApproval: boolean;
  reviewUrl: string;
}

export async function fireTrigger(
  trigger: AgentTrigger,
  source: "cron" | "manual",
  manualActor?: { clerkUserId: string; email: string },
): Promise<FireOutcome> {
  // Synthetic identity: `cron:<id>` for cron-fired runs (no human
  // actor); for manual fires we still bill the run to the trigger
  // identity but record the manual actor on the audit row.
  const identityId = `cron:${trigger.id}`;
  const identityName = `cron-${slug(trigger.name)}`;

  const intent = trigger.intentJson as unknown as Intent;
  const result = await triggerExternalRun({
    request: trigger.request,
    intent,
    autoExecute: trigger.autoExecute,
    apiKeyId: identityId,
    apiKeyName: identityName,
  });

  await writeAuditLog({
    eventType: source === "manual" ? "agent.trigger.manual_fired" : "agent.trigger.fired",
    eventCategory: "system",
    action:
      source === "manual"
        ? `agent: trigger '${trigger.name}' fired manually by ${manualActor?.email ?? "?"}`
        : `agent: trigger '${trigger.name}' fired by cron`,
    actorClerkUserId: manualActor?.clerkUserId ?? null,
    actorEmail: manualActor?.email ?? null,
    resourceType: "agent_trigger",
    resourceId: trigger.id,
    metadata: {
      runId: result.runId,
      runStatus: result.status,
      requiresApproval: result.requiresApproval,
      cronExpression: trigger.cronExpression,
    },
  });

  return {
    runId: result.runId,
    runStatus: result.status,
    requiresApproval: result.requiresApproval,
    reviewUrl: result.reviewUrl,
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "trigger";
}

// ───────────────────────────────────────────────────────────────────────────
// Helper: best-effort surface for the management UI to flag triggers
// that are about to be cancelled (5+ consecutive failures).
// ───────────────────────────────────────────────────────────────────────────

export const TRIGGER_FAILURE_DISABLE_THRESHOLD = 10;

export function isTriggerStuck(t: { consecutiveFailures: number }): boolean {
  return t.consecutiveFailures >= 3;
}
