/**
 * Slice 3 risk rules — derived from Railway deployment state.
 *
 *   failed_deployment        Railway latest status is `failed`.
 *   crashed_deployment       Railway latest status is `crashed`.
 *   stale_deployment         No successful deployment in N days for an
 *                            active production app.
 *   missing_railway_mapping  Active production app has no
 *                            RailwayResource row.
 *
 * Pure functions. The risk service (`reconcileDeploymentRisksForApp`)
 * reconciles these against existing open OperationalRiskFlag rows.
 */

import type {
  AppRegistry,
  DeploymentStatus,
  RiskCategory,
  RiskSeverity,
} from "@prisma/client";

export interface DerivedDeploymentRisk {
  category: RiskCategory;
  severity: RiskSeverity;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface DeploymentSnapshotInput {
  /** Set when a RailwayResource exists for this app. Suppresses
   *  missing_railway_mapping when present. */
  hasRailwayMapping: boolean;
  /** Latest deployment we observed. Null when the resource exists but
   *  no deployments have been recorded yet (brand-new service). */
  latestStatus: DeploymentStatus | null;
  latestStatusRaw: string | null;
  latestCheckedAt: Date | null;
  /** Time of the last status:'success' deployment in our snapshots. */
  lastSuccessfulAt: Date | null;
  /** The Railway dashboard URL surfaced on the flag for fast triage. */
  dashboardUrl: string | null;
  /** Service name for human-readable titles. */
  serviceName: string | null;
}

const STALE_THRESHOLD_DAYS = 7;

export function evaluateDeploymentRisks(
  app: AppRegistry,
  snap: DeploymentSnapshotInput,
): DerivedDeploymentRisk[] {
  const out: DerivedDeploymentRisk[] = [];
  const isProductionish =
    app.lifecycle === "production" || app.lifecycle === "staging";

  // ── missing_railway_mapping ──────────────────────────────────────────
  // Only flag for productionish apps that we expect to be on Railway.
  // Apps in development / deprecated / retired aren't required to map.
  if (!snap.hasRailwayMapping) {
    if (isProductionish) {
      out.push({
        category: "missing_railway_mapping",
        severity: bumpForCriticality(app.criticality, "low"),
        title: `${app.name} has no Railway service mapping`,
        description:
          "Set RailwayResource (project/service/environment) so the Suite can correlate deployments. Until then, Slice 3 deployment-drift detection is blind on this app.",
        metadata: {
          app_key: app.appKey,
          railway_service_id_on_app_registry: app.railwayServiceId ?? null,
          lifecycle: app.lifecycle,
        },
      });
    }
    // No mapping → can't evaluate the other three categories.
    return out;
  }

  // ── failed_deployment ────────────────────────────────────────────────
  if (snap.latestStatus === "failed") {
    out.push({
      category: "failed_deployment",
      severity: bumpForCriticality(app.criticality, "high"),
      title: `${app.name}: Railway deployment failed`,
      description: `Latest deployment for ${snap.serviceName ?? app.appKey} reported status \`failed\`. Build or release step never came up.${
        snap.dashboardUrl ? ` ${snap.dashboardUrl}` : ""
      }`,
      metadata: {
        app_key: app.appKey,
        railway_status_raw: snap.latestStatusRaw,
        dashboard_url: snap.dashboardUrl,
        checked_at: snap.latestCheckedAt,
      },
    });
  }

  // ── crashed_deployment ───────────────────────────────────────────────
  // Distinct from failed — the process came up and then exited. Often
  // a runtime error rather than a build problem; severity treated the
  // same since impact on users is equivalent.
  if (snap.latestStatus === "crashed") {
    out.push({
      category: "crashed_deployment",
      severity: bumpForCriticality(app.criticality, "high"),
      title: `${app.name}: Railway deployment crashed`,
      description: `Latest deployment for ${snap.serviceName ?? app.appKey} reported status \`crashed\`. Process started and then exited.${
        snap.dashboardUrl ? ` ${snap.dashboardUrl}` : ""
      }`,
      metadata: {
        app_key: app.appKey,
        railway_status_raw: snap.latestStatusRaw,
        dashboard_url: snap.dashboardUrl,
        checked_at: snap.latestCheckedAt,
      },
    });
  }

  // ── stale_deployment ─────────────────────────────────────────────────
  // Only fires for productionish apps. Apps in development are
  // legitimately allowed to sit between deploys.
  if (isProductionish) {
    const ref = snap.lastSuccessfulAt;
    if (ref) {
      const ageMs = Date.now() - ref.getTime();
      const ageDays = ageMs / 86_400_000;
      if (ageDays >= STALE_THRESHOLD_DAYS) {
        out.push({
          category: "stale_deployment",
          severity: bumpForCriticality(
            app.criticality,
            ageDays >= 30 ? "medium" : "low",
          ),
          title: `${app.name}: no successful deploy in ${Math.floor(ageDays)} days`,
          description: `Last successful deployment for ${snap.serviceName ?? app.appKey} was ${formatAge(
            ageMs,
          )} ago. Either ship something, or downgrade lifecycle from production if this is intentional.`,
          metadata: {
            app_key: app.appKey,
            last_successful_at: ref,
            age_days: Math.floor(ageDays),
            dashboard_url: snap.dashboardUrl,
          },
        });
      }
    }
    // If we have a Railway mapping but have NEVER observed a success,
    // that's a different thing than stale — it's "this service has
    // never deployed cleanly". Treat as failed_deployment-class signal.
    if (snap.lastSuccessfulAt === null && snap.latestStatus === null) {
      out.push({
        category: "stale_deployment",
        severity: bumpForCriticality(app.criticality, "low"),
        title: `${app.name}: no observed Railway deployments`,
        description:
          "Railway service is mapped but the Suite has never seen a deployment for it. First sync may not have completed, or the service hasn't deployed yet.",
        metadata: {
          app_key: app.appKey,
          dashboard_url: snap.dashboardUrl,
        },
      });
    }
  }

  return out;
}

function bumpForCriticality(
  criticality: AppRegistry["criticality"],
  base: "low" | "medium" | "high",
): RiskSeverity {
  if (criticality === "mission_critical") {
    return base === "low" ? "medium" : base === "medium" ? "high" : "critical";
  }
  if (criticality === "high") {
    return base;
  }
  if (criticality === "medium") {
    return base === "high" ? "medium" : base;
  }
  return base === "high" ? "medium" : base === "medium" ? "low" : "low";
}

function formatAge(ms: number): string {
  const d = ms / 86_400_000;
  if (d < 1) return `${Math.round(ms / 3_600_000)}h`;
  if (d < 30) return `${Math.floor(d)}d`;
  return `${Math.floor(d / 30)}mo`;
}
