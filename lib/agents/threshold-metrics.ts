/**
 * Threshold metric registry — Slice 9.
 *
 * Code-defined (not DB-backed) — same defense-in-depth principle as
 * the AgentOps capability registry. An unauthorized DB write cannot
 * widen what metrics a threshold trigger can read, because the set
 * is enumerated here at compile time.
 *
 * Each metric is a pure-data evaluator: takes no input, queries the
 * DB, returns a Float. The threshold scheduler compares this value
 * to the trigger's stored thresholdValue using the configured
 * operator (gt / gte / lt / lte / eq / ne).
 *
 * Designed to be cheap — every enabled threshold trigger evaluates
 * its metric on every cron tick (every 5 minutes by default), so
 * each evaluator is one SELECT count() with bounded scan.
 */

import { prisma } from "@/lib/db/prisma";
import type { ThresholdOperator } from "@prisma/client";

export interface ThresholdMetricDef {
  key: string;
  label: string;
  description: string;
  unit: string;
  /** Time-window-bounded metrics declare it here for UI display. */
  windowHours?: number;
  evaluate(): Promise<number>;
}

// ───────────────────────────────────────────────────────────────────────
// Risk metrics
// ───────────────────────────────────────────────────────────────────────

const open_risks_count: ThresholdMetricDef = {
  key: "open_risks_count",
  label: "Open operational risks",
  description: "Count of OperationalRiskFlag rows with status='open'.",
  unit: "risks",
  async evaluate() {
    return prisma.operationalRiskFlag.count({ where: { status: "open" } });
  },
};

const open_risks_critical_count: ThresholdMetricDef = {
  key: "open_risks_critical_count",
  label: "Open critical-severity risks",
  description: "Count of open OperationalRiskFlag rows with severity='critical'.",
  unit: "risks",
  async evaluate() {
    return prisma.operationalRiskFlag.count({
      where: { status: "open", severity: "critical" },
    });
  },
};

const open_risks_high_or_critical_count: ThresholdMetricDef = {
  key: "open_risks_high_or_critical_count",
  label: "Open high or critical risks",
  description: "Count of open risks with severity high or critical.",
  unit: "risks",
  async evaluate() {
    return prisma.operationalRiskFlag.count({
      where: { status: "open", severity: { in: ["high", "critical"] } },
    });
  },
};

// ───────────────────────────────────────────────────────────────────────
// Deployment + workflow metrics
// ───────────────────────────────────────────────────────────────────────

const deployment_drift_count: ThresholdMetricDef = {
  key: "deployment_drift_count",
  label: "Apps drifted from main",
  description:
    "Count of DeploymentSnapshot rows whose productionDriftStatus is not in_sync (looking at the latest snapshot per resource).",
  unit: "apps",
  async evaluate() {
    // Latest-snapshot-per-resource collapse via groupBy + max checkedAt.
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT DISTINCT ON ("railwayResourceId") "productionDriftStatus"
        FROM "DeploymentSnapshot"
        ORDER BY "railwayResourceId", "checkedAt" DESC
      ) latest
      WHERE latest."productionDriftStatus" NOT IN ('in_sync', 'unknown')
    `;
    return Number(rows[0]?.count ?? 0);
  },
};

const failed_workflow_count_24h: ThresholdMetricDef = {
  key: "failed_workflow_count_24h",
  label: "Failed workflow runs (24h)",
  description:
    "Count of GitWorkflowRun with conclusion in failure / timed_out / startup_failure in the last 24h.",
  unit: "runs",
  windowHours: 24,
  async evaluate() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return prisma.gitWorkflowRun.count({
      where: {
        conclusion: { in: ["failure", "timed_out", "startup_failure"] },
        startedAt: { gte: since },
      },
    });
  },
};

const failed_deployment_count_24h: ThresholdMetricDef = {
  key: "failed_deployment_count_24h",
  label: "Failed Railway deployments (24h)",
  description:
    "Count of DeploymentSnapshot rows with railwayStatus failed or crashed in the last 24h.",
  unit: "deployments",
  windowHours: 24,
  async evaluate() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return prisma.deploymentSnapshot.count({
      where: {
        railwayStatus: { in: ["failed", "crashed"] },
        checkedAt: { gte: since },
      },
    });
  },
};

// ───────────────────────────────────────────────────────────────────────
// Health + traffic metrics
// ───────────────────────────────────────────────────────────────────────

const health_failure_count: ThresholdMetricDef = {
  key: "health_failure_count",
  label: "Apps with failing health probe",
  description:
    "Count of active apps whose latest HealthCheckSnapshot is degraded or down.",
  unit: "apps",
  async evaluate() {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT DISTINCT ON ("appRegistryId") "status"
        FROM "HealthCheckSnapshot"
        ORDER BY "appRegistryId", "checkedAt" DESC
      ) latest
      WHERE latest."status" IN ('degraded', 'down')
    `;
    return Number(rows[0]?.count ?? 0);
  },
};

const traffic_error_count_1h: ThresholdMetricDef = {
  key: "traffic_error_count_1h",
  label: "HTTP errors observed (1h)",
  description:
    "Count of AppCallEvent rows with statusCode >= 400 in the last 1h.",
  unit: "calls",
  windowHours: 1,
  async evaluate() {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    return prisma.appCallEvent.count({
      where: { statusCode: { gte: 400 }, occurredAt: { gte: since } },
    });
  },
};

// ───────────────────────────────────────────────────────────────────────
// Agent runtime metrics
// ───────────────────────────────────────────────────────────────────────

const agent_run_refused_count_1h: ThresholdMetricDef = {
  key: "agent_run_refused_count_1h",
  label: "Agent runs refused by IBE (1h)",
  description:
    "Count of AgentRun rows with status='refused' in the last 1h. A non-zero value means an IBE invariant tripped — operators should investigate.",
  unit: "runs",
  windowHours: 1,
  async evaluate() {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    return prisma.agentRun.count({
      where: { status: "refused", completedAt: { gte: since } },
    });
  },
};

const agent_run_awaiting_approval_count: ThresholdMetricDef = {
  key: "agent_run_awaiting_approval_count",
  label: "Agent runs awaiting approval",
  description:
    "Count of AgentRun rows currently in awaiting_approval state. Non-zero = there's a pending decision for an admin who isn't the requester.",
  unit: "runs",
  async evaluate() {
    return prisma.agentRun.count({ where: { status: "awaiting_approval" } });
  },
};

// ───────────────────────────────────────────────────────────────────────
// Registry exports
// ───────────────────────────────────────────────────────────────────────

const ALL: ThresholdMetricDef[] = [
  open_risks_count,
  open_risks_critical_count,
  open_risks_high_or_critical_count,
  deployment_drift_count,
  failed_workflow_count_24h,
  failed_deployment_count_24h,
  health_failure_count,
  traffic_error_count_1h,
  agent_run_refused_count_1h,
  agent_run_awaiting_approval_count,
];

const BY_KEY = new Map<string, ThresholdMetricDef>(ALL.map((m) => [m.key, m]));

export function listThresholdMetrics(): readonly ThresholdMetricDef[] {
  return ALL;
}

export function getThresholdMetric(key: string): ThresholdMetricDef | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * Pure compare. The scheduler re-uses this so the same arithmetic
 * lives in one place; tests would too if/when they exist.
 */
export function compare(
  value: number,
  op: ThresholdOperator,
  threshold: number,
): boolean {
  switch (op) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "eq":
      return value === threshold;
    case "ne":
      return value !== threshold;
  }
}
