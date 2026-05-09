"use server";

/**
 * Server actions for inline risk-row actions — Sprint 17.
 *
 * Three operations exposed to the UI:
 *   - acknowledgeRiskAction(riskId)         — triage signal: "I'm on it"
 *   - resolveRiskAction(riskId, reason?)    — manual close (e.g. handled
 *     out-of-band; the underlying condition will likely auto-resolve
 *     on the next reconciliation tick anyway)
 *   - ignoreRiskAction(riskId, reason?)     — false positive
 *
 * All three are gated by RISK_MANAGE. Every change writes an audit
 * log entry so we can answer "who closed risk X and why".
 *
 * The thin wrapper around the existing acknowledgeRisk service is
 * intentional — the service is callable from the orchestrator's
 * acknowledge_risk_flag capability too, and we want one source of
 * truth for the underlying logic.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { acknowledgeRisk } from "./risk-service";

export interface RiskActionResult {
  ok: boolean;
  status?: string;
  reason?: string;
}

export async function acknowledgeRiskAction(
  riskId: string,
): Promise<RiskActionResult> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.RISK_MANAGE);
  const updated = await acknowledgeRisk(riskId, ctx.userProfile.email);
  if (!updated) return { ok: false, reason: "not_open" };
  revalidatePath("/admin/ops/risk");
  revalidatePath("/command-center");
  return { ok: true, status: updated.status };
}

export async function resolveRiskAction(
  riskId: string,
  reason?: string,
): Promise<RiskActionResult> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.RISK_MANAGE);
  const existing = await prisma.operationalRiskFlag.findUnique({
    where: { id: riskId },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status === "resolved") return { ok: true, status: "resolved" };

  const updated = await prisma.operationalRiskFlag.update({
    where: { id: riskId },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      // resolvedBy lives in metadataJson — schema doesn't have a
      // dedicated column. Acceptable trade-off vs adding a migration
      // for a single field that's also captured in the audit log.
      metadataJson: {
        ...((existing.metadataJson as Record<string, unknown> | null) ?? {}),
        resolvedBy: ctx.userProfile.email,
        resolveReason: reason ?? null,
        resolvedManually: true,
      },
    },
  });
  await writeAuditLog({
    eventType: "command_center.risk.manually_resolved",
    eventCategory: "system",
    severity: "info",
    action: `Risk manually resolved by ${ctx.userProfile.email}: ${existing.title}`,
    appRegistryId: existing.appRegistryId,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "operational_risk_flag",
    resourceId: riskId,
    metadata: { category: existing.category, reason: reason ?? null },
  });
  revalidatePath("/admin/ops/risk");
  revalidatePath("/command-center");
  return { ok: true, status: updated.status };
}

export async function ignoreRiskAction(
  riskId: string,
  reason?: string,
): Promise<RiskActionResult> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.RISK_MANAGE);
  const existing = await prisma.operationalRiskFlag.findUnique({
    where: { id: riskId },
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status === "ignored") return { ok: true, status: "ignored" };

  const updated = await prisma.operationalRiskFlag.update({
    where: { id: riskId },
    data: {
      status: "ignored",
      metadataJson: {
        ...((existing.metadataJson as Record<string, unknown> | null) ?? {}),
        ignoredBy: ctx.userProfile.email,
        ignoreReason: reason ?? null,
      },
    },
  });
  await writeAuditLog({
    eventType: "command_center.risk.ignored",
    eventCategory: "system",
    severity: "warning",
    action: `Risk marked ignored by ${ctx.userProfile.email}: ${existing.title}`,
    appRegistryId: existing.appRegistryId,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "operational_risk_flag",
    resourceId: riskId,
    metadata: { category: existing.category, reason: reason ?? null },
  });
  revalidatePath("/admin/ops/risk");
  revalidatePath("/command-center");
  return { ok: true, status: updated.status };
}
