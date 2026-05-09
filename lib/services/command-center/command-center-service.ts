/**
 * Top-level reconciliation orchestrator + status aggregator for the
 * MacTech Command Center. Slice 1 surface:
 *   - runReconciliation()  — probe every active app, reconcile risks,
 *                            emit IntegrationEvent + AuditLog summary.
 *                            Fault-tolerant: one app's failure cannot
 *                            crash the whole run.
 *   - getCommandCenterStatus() — aggregate counts for the overview tiles.
 *   - getAppOperationalSnapshots() — hydrated app rows for the apps list.
 *   - getOpenRiskFlags() — risk feed for the page.
 *
 * Future slices extend runReconciliation with the GitHub + Railway sync
 * legs without touching the contract here.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { env, githubSyncConfigured, railwaySyncConfigured } from "@/lib/env";
import { probeAndPersist } from "./health-check-service";
import {
  reconcileDeploymentRisksForApp,
  reconcileRepoRisksForApp,
  reconcileRisksForApp,
} from "./risk-service";
import { syncAllRepositoriesForApps } from "./github-sync-service";
import { getRepoSnapshotForApp } from "./repo-intelligence-service";
import { syncAllRailwayResources } from "./railway-sync-service";
import { getDeploymentSnapshotForApp } from "./deployment-intelligence-service";
import type { HealthProbeResult } from "@/lib/integrations/health/checker";
import type {
  AppRegistry,
  HealthCheckSnapshot,
  HealthStatus,
  OperationalRiskFlag,
  RiskSeverity,
} from "@prisma/client";

// ─── Reconciliation ───────────────────────────────────────────────────────

export interface ReconciliationOutcome {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  appsProbed: number;
  appsHealthy: number;
  appsDegraded: number;
  appsDown: number;
  appsUnknown: number;
  risksOpened: number;
  risksResolved: number;
  perAppErrors: Array<{ appKey: string; error: string }>;
  trigger: ReconciliationTrigger;
  // Slice 2: GitHub sync leg. Zeros when ENABLE_GITHUB_SYNC is off.
  reposAttempted: number;
  reposSucceeded: number;
  commitsInserted: number;
  workflowRunsUpserted: number;
  perRepoErrors: Array<{ fullName: string; error: string }>;
  // Slice 3: Railway sync leg. Zeros when ENABLE_RAILWAY_SYNC is off.
  railwayAppsAttempted: number;
  railwayAppsSucceeded: number;
  railwaySnapshotsWritten: number;
  perRailwayErrors: Array<{ appKey: string; error: string }>;
}

export type ReconciliationTrigger = "manual" | "cron" | "boot";

export async function runReconciliation(
  trigger: ReconciliationTrigger,
  triggeredByEmail?: string | null,
): Promise<ReconciliationOutcome> {
  const startedAt = new Date();
  const apps = await prisma.appRegistry.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
  });

  let appsHealthy = 0,
    appsDegraded = 0,
    appsDown = 0,
    appsUnknown = 0;
  let risksOpened = 0,
    risksResolved = 0;
  const perAppErrors: Array<{ appKey: string; error: string }> = [];
  // Track each app's probe so the repo-risk leg can read live commit
  // shas from /api/build-info without re-probing.
  const probeByAppId = new Map<string, HealthProbeResult>();

  // ── Health leg ───────────────────────────────────────────────────────
  for (const app of apps) {
    try {
      const probeResult = await probeAndPersist(app);
      probeByAppId.set(app.id, probeResult.probe);
      switch (probeResult.probe.status) {
        case "up":
          appsHealthy++;
          break;
        case "degraded":
          appsDegraded++;
          break;
        case "down":
          appsDown++;
          break;
        case "unknown":
          appsUnknown++;
          break;
      }
      // Sprint 39: page-render probe. Anonymous GET on the
      // customer-facing page (publicUrl > baseUrl), looks for 5xx
      // OR Next.js's "Application error · Digest:" SSR sentinel.
      // Catches the case where /api/health returns ok but the
      // actual rendered pages 500 due to a missing env var.
      const pageProbeUrl = app.publicUrl ?? app.baseUrl ?? null;
      const { probePageRender } = await import(
        "@/lib/integrations/health/page-render-probe"
      );
      const pageProbe = pageProbeUrl
        ? await probePageRender(pageProbeUrl)
        : null;
      const riskOutcome = await reconcileRisksForApp({
        app,
        probe: probeResult.probe,
        pageProbe,
      });
      risksOpened += riskOutcome.opened.length;
      risksResolved += riskOutcome.resolved.length;
    } catch (err) {
      perAppErrors.push({
        appKey: app.appKey,
        error: err instanceof Error ? err.message : "unknown_error",
      });
    }
  }

  // ── GitHub sync leg ──────────────────────────────────────────────────
  // Skipped entirely when ENABLE_GITHUB_SYNC is off or GITHUB_TOKEN
  // is missing — outcome carries zeros so the caller can render.
  let reposAttempted = 0,
    reposSucceeded = 0,
    commitsInserted = 0,
    workflowRunsUpserted = 0;
  let perRepoErrors: Array<{ fullName: string; error: string }> = [];
  if (githubSyncConfigured()) {
    try {
      const syncOutcome = await syncAllRepositoriesForApps(triggeredByEmail ?? null);
      reposAttempted = syncOutcome.reposAttempted;
      reposSucceeded = syncOutcome.reposSucceeded;
      commitsInserted = syncOutcome.totalCommitsInserted;
      workflowRunsUpserted = syncOutcome.totalWorkflowsUpserted;
      perRepoErrors = syncOutcome.perRepoErrors;
    } catch (err) {
      perRepoErrors.push({
        fullName: "*",
        error: err instanceof Error ? err.message : "unknown_error",
      });
    }

    // ── Repo-risk reconciliation leg ───────────────────────────────────
    // Reads the freshly-synced GitRepository state + the live commit
    // sha from each app's most recent /api/build-info probe and
    // opens/resolves slice-2 risk flags accordingly.
    for (const app of apps) {
      try {
        const probe = probeByAppId.get(app.id) ?? null;
        const liveCommitSha = probe?.parsed?.commitSha ?? null;
        const snapshot = await getRepoSnapshotForApp(app, liveCommitSha);
        const repoRiskOutcome = await reconcileRepoRisksForApp({ app, snapshot });
        risksOpened += repoRiskOutcome.opened.length;
        risksResolved += repoRiskOutcome.resolved.length;
      } catch (err) {
        perAppErrors.push({
          appKey: app.appKey,
          error: `repo_risk_${err instanceof Error ? err.message : "unknown_error"}`,
        });
      }
    }
  }

  // ── Railway sync leg (Slice 3) ──────────────────────────────────────
  // Skipped entirely when ENABLE_RAILWAY_SYNC is off. Always runs the
  // deployment-risk reconciliation pass after — that one reads from
  // existing DeploymentSnapshot rows and emits missing_railway_mapping
  // for productionish apps that haven't been mapped yet, so it has
  // value even when Railway sync is off.
  let railwayAppsAttempted = 0,
    railwayAppsSucceeded = 0,
    railwaySnapshotsWritten = 0;
  let perRailwayErrors: Array<{ appKey: string; error: string }> = [];
  if (railwaySyncConfigured()) {
    try {
      const railwayOutcome = await syncAllRailwayResources(triggeredByEmail ?? null);
      railwayAppsAttempted = railwayOutcome.appsAttempted;
      railwayAppsSucceeded = railwayOutcome.appsSucceeded;
      railwaySnapshotsWritten = railwayOutcome.snapshotsWritten;
      perRailwayErrors = railwayOutcome.perAppErrors;
    } catch (err) {
      perRailwayErrors.push({
        appKey: "*",
        error: err instanceof Error ? err.message : "unknown_error",
      });
    }
  }

  // Deployment-risk reconciliation runs whether or not Railway sync is
  // configured — missing_railway_mapping is a meaningful signal even
  // before the API token is set.
  for (const app of apps) {
    try {
      const ds = await getDeploymentSnapshotForApp(app);
      if (!ds) continue;
      const out = await reconcileDeploymentRisksForApp({
        app,
        snapshot: {
          hasRailwayMapping: ds.hasRailwayMapping,
          latestStatus: ds.latest?.railwayStatus ?? null,
          latestStatusRaw: ds.latest?.railwayStatusRaw ?? null,
          latestCheckedAt: ds.latest?.checkedAt ?? null,
          lastSuccessfulAt: ds.lastSuccessfulAt,
          dashboardUrl: ds.resource?.railwayDashboardUrl ?? null,
          serviceName: ds.resource?.serviceName ?? null,
        },
      });
      risksOpened += out.opened.length;
      risksResolved += out.resolved.length;
    } catch (err) {
      perAppErrors.push({
        appKey: app.appKey,
        error: `deployment_risk_${err instanceof Error ? err.message : "unknown_error"}`,
      });
    }
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  // One IntegrationEvent so the timeline always has the run.
  await prisma.integrationEvent.create({
    data: {
      provider: "internal",
      eventType: "command_center.reconciliation.completed",
      eventAction: trigger,
      severity:
        perAppErrors.length > 0 || perRepoErrors.length > 0 || perRailwayErrors.length > 0
          ? "medium"
          : "info",
      processedAt: finishedAt,
      payloadJson: {
        trigger,
        triggered_by_email: triggeredByEmail ?? null,
        apps_probed: apps.length,
        apps_healthy: appsHealthy,
        apps_degraded: appsDegraded,
        apps_down: appsDown,
        apps_unknown: appsUnknown,
        risks_opened: risksOpened,
        risks_resolved: risksResolved,
        per_app_errors: perAppErrors,
        repos_attempted: reposAttempted,
        repos_succeeded: reposSucceeded,
        commits_inserted: commitsInserted,
        workflow_runs_upserted: workflowRunsUpserted,
        per_repo_errors: perRepoErrors,
        railway_apps_attempted: railwayAppsAttempted,
        railway_apps_succeeded: railwayAppsSucceeded,
        railway_snapshots_written: railwaySnapshotsWritten,
        per_railway_errors: perRailwayErrors,
        duration_ms: durationMs,
      },
    },
  });

  await writeAuditLog({
    eventType: "command_center.reconciliation.completed",
    eventCategory: "system",
    severity: appsDown > 0 ? "warning" : "info",
    action: `Reconciliation (${trigger}): ${appsHealthy} up, ${appsDegraded} degraded, ${appsDown} down, ${appsUnknown} unknown · ${reposSucceeded}/${reposAttempted} repos · ${railwayAppsSucceeded}/${railwayAppsAttempted} railway · +${risksOpened} risks, -${risksResolved} resolved · ${durationMs}ms`,
    actorEmail: triggeredByEmail ?? null,
    metadata: {
      trigger,
      apps_probed: apps.length,
      apps_healthy: appsHealthy,
      apps_degraded: appsDegraded,
      apps_down: appsDown,
      apps_unknown: appsUnknown,
      risks_opened: risksOpened,
      risks_resolved: risksResolved,
      per_app_errors: perAppErrors,
      repos_attempted: reposAttempted,
      repos_succeeded: reposSucceeded,
      commits_inserted: commitsInserted,
      workflow_runs_upserted: workflowRunsUpserted,
      per_repo_errors: perRepoErrors,
      railway_apps_attempted: railwayAppsAttempted,
      railway_apps_succeeded: railwayAppsSucceeded,
      railway_snapshots_written: railwaySnapshotsWritten,
      per_railway_errors: perRailwayErrors,
      duration_ms: durationMs,
    },
  });

  return {
    startedAt,
    finishedAt,
    durationMs,
    appsProbed: apps.length,
    appsHealthy,
    appsDegraded,
    appsDown,
    appsUnknown,
    risksOpened,
    risksResolved,
    perAppErrors,
    trigger,
    reposAttempted,
    reposSucceeded,
    commitsInserted,
    workflowRunsUpserted,
    perRepoErrors,
    railwayAppsAttempted,
    railwayAppsSucceeded,
    railwaySnapshotsWritten,
    perRailwayErrors,
  };
}

// ─── Status aggregation ───────────────────────────────────────────────────

export interface CommandCenterStatus {
  totalApps: number;
  byHealth: Record<HealthStatus, number>;
  bySeverity: Record<RiskSeverity, number>;
  openRiskCount: number;
  criticalRiskCount: number;
  appsMissingHealthUrl: number;
  lastReconciliationAt: Date | null;
  lastReconciliationOutcome: "ok" | "with_errors" | null;
}

export async function getCommandCenterStatus(): Promise<CommandCenterStatus> {
  const [apps, openRisks, lastRecon] = await Promise.all([
    prisma.appRegistry.findMany({
      where: { status: "active" },
      select: {
        id: true,
        appKey: true,
        healthUrl: true,
        healthSnapshots: {
          orderBy: { checkedAt: "desc" },
          take: 1,
          select: { status: true },
        },
      },
    }),
    prisma.operationalRiskFlag.findMany({
      where: { status: "open" },
      select: { severity: true },
    }),
    prisma.integrationEvent.findFirst({
      where: { eventType: "command_center.reconciliation.completed" },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true, severity: true },
    }),
  ]);

  const byHealth: Record<HealthStatus, number> = { up: 0, degraded: 0, down: 0, unknown: 0 };
  let appsMissingHealthUrl = 0;
  for (const a of apps) {
    if (!a.healthUrl) appsMissingHealthUrl++;
    const latest = a.healthSnapshots[0]?.status ?? "unknown";
    byHealth[latest]++;
  }

  const bySeverity: Record<RiskSeverity, number> = {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  for (const r of openRisks) bySeverity[r.severity]++;

  return {
    totalApps: apps.length,
    byHealth,
    bySeverity,
    openRiskCount: openRisks.length,
    criticalRiskCount: bySeverity.critical + bySeverity.high,
    appsMissingHealthUrl,
    lastReconciliationAt: lastRecon?.receivedAt ?? null,
    lastReconciliationOutcome: lastRecon
      ? lastRecon.severity === "info"
        ? "ok"
        : "with_errors"
      : null,
  };
}

// ─── App snapshots (page list) ────────────────────────────────────────────

export interface AppOperationalSnapshot {
  app: AppRegistry;
  latestHealth: HealthCheckSnapshot | null;
  openRisks: OperationalRiskFlag[];
}

export async function getAppOperationalSnapshots(): Promise<AppOperationalSnapshot[]> {
  const apps = await prisma.appRegistry.findMany({
    where: { status: "active" },
    orderBy: [{ criticality: "desc" }, { name: "asc" }],
    include: {
      healthSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
      },
      riskFlags: {
        where: { status: "open" },
        orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
      },
    },
  });
  return apps.map((a) => ({
    app: a,
    latestHealth: a.healthSnapshots[0] ?? null,
    openRisks: a.riskFlags,
  }));
}

// ─── Risk feed ─────────────────────────────────────────────────────────────

export async function getOpenRiskFlags(limit = 50): Promise<
  Array<OperationalRiskFlag & { app: { appKey: string; name: string } | null }>
> {
  return prisma.operationalRiskFlag.findMany({
    where: { status: "open" },
    orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
    take: limit,
    include: {
      app: { select: { appKey: true, name: true } },
    },
  });
}
