/**
 * OperationalRiskFlag reconciliation. Pattern:
 *
 *   evaluator returns the risks that *should* be open right now
 *   ↓
 *   service compares to existing OPEN flags in the DB
 *   ↓
 *   • new categories      → INSERT row, status=open, audit-log "opened"
 *   • still-open same     → UPDATE updatedAt, refresh metadata
 *   • previously-open but
 *     not in this snapshot → UPDATE status=resolved + resolvedAt + audit
 *
 * Open rows stay one-per-(app,category) by the unique index on the
 * Prisma schema, so concurrent reconciliations can't race-create dupes.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { evaluateRisks, type DerivedRisk } from "@/lib/integrations/risk/evaluator";
import { evaluateRepoRisks, type DerivedRepoRisk, type RepoSnapshot } from "@/lib/integrations/risk/repo-evaluator";
import {
  evaluateDeploymentRisks,
  type DerivedDeploymentRisk,
  type DeploymentSnapshotInput,
} from "@/lib/integrations/risk/deployment-evaluator";
import type { HealthProbeResult } from "@/lib/integrations/health/checker";
import type { AppRegistry, OperationalRiskFlag, Prisma, RiskCategory } from "@prisma/client";

export interface ReconcileRisksInput {
  app: AppRegistry;
  probe: HealthProbeResult | null;
}

export interface ReconcileRisksOutcome {
  opened: OperationalRiskFlag[];
  refreshed: OperationalRiskFlag[];
  resolved: OperationalRiskFlag[];
}

/** Categories this slice's evaluator can produce. We only resolve flags
 *  in this set — flags raised by future evaluators (slice 2/3 categories)
 *  must not be auto-resolved by the slice-1 reconciliation. */
const SLICE_1_OWNED_CATEGORIES: RiskCategory[] = [
  "health_down",
  "degraded",
  "missing_health_endpoint",
];

export async function reconcileRisksForApp(
  input: ReconcileRisksInput,
): Promise<ReconcileRisksOutcome> {
  const { app, probe } = input;
  const derived = evaluateRisks(app, probe);
  const desiredByCat = new Map<RiskCategory, DerivedRisk>(
    derived.map((d) => [d.category, d]),
  );

  const existingOpen = await prisma.operationalRiskFlag.findMany({
    where: {
      appRegistryId: app.id,
      status: "open",
      category: { in: SLICE_1_OWNED_CATEGORIES },
    },
  });

  const opened: OperationalRiskFlag[] = [];
  const refreshed: OperationalRiskFlag[] = [];
  const resolved: OperationalRiskFlag[] = [];

  // Open or refresh
  for (const d of Array.from(desiredByCat.values())) {
    const match = existingOpen.find((e) => e.category === d.category);
    if (match) {
      const updated = await prisma.operationalRiskFlag.update({
        where: { id: match.id },
        data: {
          severity: d.severity,
          title: d.title,
          description: d.description,
          metadataJson: d.metadata as Prisma.InputJsonValue,
        },
      });
      refreshed.push(updated);
    } else {
      const created = await prisma.operationalRiskFlag.create({
        data: {
          appRegistryId: app.id,
          severity: d.severity,
          status: "open",
          category: d.category,
          title: d.title,
          description: d.description,
          metadataJson: d.metadata as Prisma.InputJsonValue,
        },
      });
      opened.push(created);
      await writeAuditLog({
        eventType: "command_center.risk.opened",
        eventCategory: "system",
        severity:
          d.severity === "critical"
            ? "critical"
            : d.severity === "high" || d.severity === "medium"
              ? "warning"
              : "info",
        action: `Risk opened: ${d.title}`,
        appRegistryId: app.id,
        resourceType: "operational_risk_flag",
        resourceId: created.id,
        metadata: {
          app_key: app.appKey,
          category: d.category,
          severity: d.severity,
          ...d.metadata,
        },
      });
    }
  }

  // Resolve flags that are no longer derived
  for (const e of existingOpen) {
    if (!desiredByCat.has(e.category)) {
      const updated = await prisma.operationalRiskFlag.update({
        where: { id: e.id },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      resolved.push(updated);
      await writeAuditLog({
        eventType: "command_center.risk.resolved",
        eventCategory: "system",
        severity: "info",
        action: `Risk auto-resolved: ${e.title}`,
        appRegistryId: app.id,
        resourceType: "operational_risk_flag",
        resourceId: e.id,
        metadata: {
          app_key: app.appKey,
          category: e.category,
          duration_ms: Date.now() - e.detectedAt.getTime(),
        },
      });
    }
  }

  return { opened, refreshed, resolved };
}

// ─── Slice 2: repository-derived risks ───────────────────────────────────

const SLICE_2_OWNED_CATEGORIES: RiskCategory[] = [
  "production_behind_main",
  "failed_workflow",
  "security_sensitive_change",
];

export async function reconcileRepoRisksForApp(input: {
  app: AppRegistry;
  snapshot: RepoSnapshot | null;
}): Promise<ReconcileRisksOutcome> {
  const { app, snapshot } = input;
  // No repo mapping for this app -> no slice-2 risks to reconcile.
  // We don't auto-resolve here either; an app legitimately may have
  // had a repo link removed and the operator may want to keep
  // historical flags visible.
  if (!snapshot) {
    return { opened: [], refreshed: [], resolved: [] };
  }

  const derived: DerivedRepoRisk[] = evaluateRepoRisks(app, snapshot);
  const desiredByCat = new Map<RiskCategory, DerivedRepoRisk>(
    derived.map((d) => [d.category, d]),
  );

  const existingOpen = await prisma.operationalRiskFlag.findMany({
    where: {
      appRegistryId: app.id,
      status: "open",
      category: { in: SLICE_2_OWNED_CATEGORIES },
    },
  });

  const opened: OperationalRiskFlag[] = [];
  const refreshed: OperationalRiskFlag[] = [];
  const resolved: OperationalRiskFlag[] = [];

  for (const d of Array.from(desiredByCat.values())) {
    const match = existingOpen.find((e) => e.category === d.category);
    if (match) {
      const updated = await prisma.operationalRiskFlag.update({
        where: { id: match.id },
        data: {
          severity: d.severity,
          title: d.title,
          description: d.description,
          metadataJson: d.metadata as Prisma.InputJsonValue,
        },
      });
      refreshed.push(updated);
    } else {
      const created = await prisma.operationalRiskFlag.create({
        data: {
          appRegistryId: app.id,
          severity: d.severity,
          status: "open",
          category: d.category,
          title: d.title,
          description: d.description,
          metadataJson: d.metadata as Prisma.InputJsonValue,
        },
      });
      opened.push(created);
      await writeAuditLog({
        eventType: "command_center.risk.opened",
        eventCategory: "system",
        severity:
          d.severity === "critical"
            ? "critical"
            : d.severity === "high" || d.severity === "medium"
              ? "warning"
              : "info",
        action: `Repo risk opened: ${d.title}`,
        appRegistryId: app.id,
        resourceType: "operational_risk_flag",
        resourceId: created.id,
        metadata: {
          app_key: app.appKey,
          category: d.category,
          severity: d.severity,
          ...d.metadata,
        } as Prisma.InputJsonValue,
      });
    }
  }

  for (const e of existingOpen) {
    if (!desiredByCat.has(e.category)) {
      const updated = await prisma.operationalRiskFlag.update({
        where: { id: e.id },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      resolved.push(updated);
      await writeAuditLog({
        eventType: "command_center.risk.resolved",
        eventCategory: "system",
        severity: "info",
        action: `Repo risk auto-resolved: ${e.title}`,
        appRegistryId: app.id,
        resourceType: "operational_risk_flag",
        resourceId: e.id,
        metadata: {
          app_key: app.appKey,
          category: e.category,
          duration_ms: Date.now() - e.detectedAt.getTime(),
        },
      });
    }
  }

  return { opened, refreshed, resolved };
}

// ─── Slice 3: deployment-derived risks ───────────────────────────────────

const SLICE_3_OWNED_CATEGORIES: RiskCategory[] = [
  "failed_deployment",
  "crashed_deployment",
  "stale_deployment",
  "missing_railway_mapping",
];

export async function reconcileDeploymentRisksForApp(input: {
  app: AppRegistry;
  snapshot: DeploymentSnapshotInput;
}): Promise<ReconcileRisksOutcome> {
  const { app, snapshot } = input;
  const derived: DerivedDeploymentRisk[] = evaluateDeploymentRisks(app, snapshot);
  const desiredByCat = new Map<RiskCategory, DerivedDeploymentRisk>(
    derived.map((d) => [d.category, d]),
  );

  const existingOpen = await prisma.operationalRiskFlag.findMany({
    where: {
      appRegistryId: app.id,
      status: "open",
      category: { in: SLICE_3_OWNED_CATEGORIES },
    },
  });

  const opened: OperationalRiskFlag[] = [];
  const refreshed: OperationalRiskFlag[] = [];
  const resolved: OperationalRiskFlag[] = [];

  for (const d of Array.from(desiredByCat.values())) {
    const match = existingOpen.find((e) => e.category === d.category);
    if (match) {
      const updated = await prisma.operationalRiskFlag.update({
        where: { id: match.id },
        data: {
          severity: d.severity,
          title: d.title,
          description: d.description,
          metadataJson: d.metadata as Prisma.InputJsonValue,
        },
      });
      refreshed.push(updated);
    } else {
      const created = await prisma.operationalRiskFlag.create({
        data: {
          appRegistryId: app.id,
          severity: d.severity,
          status: "open",
          category: d.category,
          title: d.title,
          description: d.description,
          metadataJson: d.metadata as Prisma.InputJsonValue,
        },
      });
      opened.push(created);
      await writeAuditLog({
        eventType: "command_center.risk.opened",
        eventCategory: "system",
        severity:
          d.severity === "critical"
            ? "critical"
            : d.severity === "high" || d.severity === "medium"
              ? "warning"
              : "info",
        action: `Deployment risk opened: ${d.title}`,
        appRegistryId: app.id,
        resourceType: "operational_risk_flag",
        resourceId: created.id,
        metadata: {
          app_key: app.appKey,
          category: d.category,
          severity: d.severity,
          ...d.metadata,
        } as Prisma.InputJsonValue,
      });
    }
  }

  for (const e of existingOpen) {
    if (!desiredByCat.has(e.category)) {
      const updated = await prisma.operationalRiskFlag.update({
        where: { id: e.id },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      resolved.push(updated);
      await writeAuditLog({
        eventType: "command_center.risk.resolved",
        eventCategory: "system",
        severity: "info",
        action: `Deployment risk auto-resolved: ${e.title}`,
        appRegistryId: app.id,
        resourceType: "operational_risk_flag",
        resourceId: e.id,
        metadata: {
          app_key: app.appKey,
          category: e.category,
          duration_ms: Date.now() - e.detectedAt.getTime(),
        },
      });
    }
  }

  return { opened, refreshed, resolved };
}

export async function acknowledgeRisk(
  riskId: string,
  actorEmail: string,
): Promise<OperationalRiskFlag | null> {
  const existing = await prisma.operationalRiskFlag.findUnique({ where: { id: riskId } });
  if (!existing || existing.status !== "open") return null;

  const updated = await prisma.operationalRiskFlag.update({
    where: { id: riskId },
    data: {
      status: "acknowledged",
      acknowledgedAt: new Date(),
      acknowledgedBy: actorEmail,
    },
  });
  await writeAuditLog({
    eventType: "command_center.risk.acknowledged",
    eventCategory: "system",
    severity: "info",
    action: `Risk acknowledged by ${actorEmail}: ${existing.title}`,
    appRegistryId: existing.appRegistryId,
    actorEmail,
    resourceType: "operational_risk_flag",
    resourceId: riskId,
    metadata: { category: existing.category },
  });
  return updated;
}
