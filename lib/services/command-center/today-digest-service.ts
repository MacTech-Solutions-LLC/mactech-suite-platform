/**
 * "Today" digest aggregator — Slice 10.
 *
 * One server fetch returns every signal an operator wants on their
 * morning page: critical state right now + 24h activity across the
 * ecosystem (deploys, commits, workflow runs, risks, agent runs,
 * traffic anomalies).
 *
 * Deliberately doesn't reuse `getCommandCenterStatus()` etc — those
 * answer "current posture" (counts, top-of-table). The digest answers
 * "what changed in the last 24h" so the operator can scan deltas
 * rather than absolute counts.
 *
 * Cheap by design: every section is one count() or a bounded
 * findMany. Whole digest hits ~9 tables in parallel; should render
 * inside a normal page-load budget on warm Postgres.
 */

import { prisma } from "@/lib/db/prisma";

export interface TodayDigest {
  windowHours: number;
  /** Critical-right-now counts. Non-zero values get hoisted in the UI. */
  criticalNow: {
    openCriticalRisks: number;
    appsCurrentlyDown: number;
    failedDeployments24h: number;
    refusedAgentRuns24h: number;
    awaitingApproval: number;
  };
  /** 24h deploy activity. */
  deploys: Array<{
    id: string;
    appKey: string | null;
    appName: string | null;
    railwayStatus: string;
    productionDriftStatus: string;
    liveCommitShortSha: string | null;
    checkedAt: Date;
  }>;
  /** 24h commit activity. */
  commits: Array<{
    id: string;
    repoFullName: string;
    sha: string;
    shortSha: string;
    message: string;
    authorName: string | null;
    htmlUrl: string | null;
    riskFlags: string[];
    committedAt: Date | null;
  }>;
  /** 24h workflow runs (failed only). */
  failedWorkflows: Array<{
    id: string;
    repoFullName: string;
    name: string;
    conclusion: string | null;
    htmlUrl: string | null;
    startedAt: Date | null;
  }>;
  /** Risks opened in the last 24h. */
  risksOpened: Array<{
    id: string;
    severity: string;
    category: string;
    title: string;
    appKey: string | null;
    appName: string | null;
    detectedAt: Date;
  }>;
  /** Risks resolved in the last 24h. */
  risksResolved: Array<{
    id: string;
    severity: string;
    category: string;
    title: string;
    appKey: string | null;
    appName: string | null;
    resolvedAt: Date | null;
  }>;
  /** Agent runs that completed in the last 24h. */
  agentRuns: Array<{
    id: string;
    status: string;
    requestText: string;
    requestedByEmail: string;
    plannedStepCount: number;
    triggeredByApiKeyName: string | null;
    completedAt: Date | null;
    createdAt: Date;
  }>;
  /** Traffic-error pairs — top noisy edges in the last 24h. */
  trafficErrors: Array<{
    sourceLabel: string;
    targetLabel: string;
    errorCount: number;
    callCount: number;
    lastSeenAt: Date;
  }>;
  /** Sprint 40: awaiting-approval agent runs surfaced inline so the
   *  operator can Approve & Execute without leaving the dashboard.
   *  Not time-windowed — these accumulate until acted on. */
  awaitingApprovalRuns: Array<{
    id: string;
    requestText: string;
    requestedByEmail: string;
    requestedByClerkUserId: string;
    intentGoal: string | null;
    plannedStepCount: number;
    triggeredByApiKeyName: string | null;
    createdAt: Date;
  }>;
}

const TODAY_WINDOW_HOURS = 24;

export async function getTodayDigest(): Promise<TodayDigest> {
  const since = new Date(Date.now() - TODAY_WINDOW_HOURS * 60 * 60 * 1000);

  const [
    openCriticalRisks,
    failedDeployments24h,
    refusedAgentRuns24h,
    awaitingApproval,
    healthDownAppsRows,
    deploys,
    commits,
    failedWorkflows,
    risksOpened,
    risksResolved,
    agentRuns,
    trafficErrorRows,
    awaitingApprovalRuns,
  ] = await Promise.all([
    // Critical-now metrics
    prisma.operationalRiskFlag.count({
      where: { status: "open", severity: "critical" },
    }),
    prisma.deploymentSnapshot.count({
      where: {
        railwayStatus: { in: ["failed", "crashed"] },
        checkedAt: { gte: since },
      },
    }),
    prisma.agentRun.count({
      where: { status: "refused", completedAt: { gte: since } },
    }),
    prisma.agentRun.count({ where: { status: "awaiting_approval" } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT DISTINCT ON ("appRegistryId") "status"
        FROM "HealthCheckSnapshot"
        ORDER BY "appRegistryId", "checkedAt" DESC
      ) latest
      WHERE latest."status" = 'down'
    `,
    // 24h activity sections
    prisma.deploymentSnapshot.findMany({
      where: { checkedAt: { gte: since } },
      orderBy: { checkedAt: "desc" },
      take: 12,
      include: {
        app: { select: { appKey: true, name: true } },
      },
    }),
    prisma.gitCommitEvent.findMany({
      where: { committedAt: { gte: since } },
      orderBy: { committedAt: "desc" },
      take: 15,
      include: { repo: { select: { fullName: true } } },
    }),
    prisma.gitWorkflowRun.findMany({
      where: {
        startedAt: { gte: since },
        conclusion: { in: ["failure", "timed_out", "startup_failure"] },
      },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { repo: { select: { fullName: true } } },
    }),
    prisma.operationalRiskFlag.findMany({
      where: { detectedAt: { gte: since } },
      orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
      take: 10,
      include: { app: { select: { appKey: true, name: true } } },
    }),
    prisma.operationalRiskFlag.findMany({
      where: { status: "resolved", resolvedAt: { gte: since } },
      orderBy: { resolvedAt: "desc" },
      take: 10,
      include: { app: { select: { appKey: true, name: true } } },
    }),
    prisma.agentRun.findMany({
      where: {
        status: { in: ["completed", "refused", "failed"] },
        completedAt: { gte: since },
      },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        requestText: true,
        requestedByEmail: true,
        plannedStepCount: true,
        triggeredByApiKeyName: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.appCallEvent.groupBy({
      by: ["sourceLabel", "targetLabel"],
      where: { occurredAt: { gte: since }, statusCode: { gte: 400 } },
      _count: { _all: true },
      _max: { occurredAt: true },
    }),
    // Sprint 40: awaiting-approval queue surfaced inline on the
    // dashboard so the operator can act without leaving Command
    // Center. Newest first, capped — the per-row count badge in the
    // sidebar is the source of truth for the FULL queue.
    prisma.agentRun.findMany({
      where: { status: "awaiting_approval" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        requestText: true,
        requestedByEmail: true,
        requestedByClerkUserId: true,
        intentGoal: true,
        plannedStepCount: true,
        triggeredByApiKeyName: true,
        createdAt: true,
      },
    }),
  ]);

  // The traffic groupBy gives us errors-per-pair; pair it with the
  // total-call count for each pair so the ratio is visible.
  const totals = await prisma.appCallEvent.groupBy({
    by: ["sourceLabel", "targetLabel"],
    where: { occurredAt: { gte: since } },
    _count: { _all: true },
  });
  const totalsByKey = new Map<string, number>();
  for (const t of totals) {
    totalsByKey.set(`${t.sourceLabel}::${t.targetLabel}`, t._count._all);
  }

  const trafficErrors = trafficErrorRows
    .map((r) => ({
      sourceLabel: r.sourceLabel,
      targetLabel: r.targetLabel,
      errorCount: r._count._all,
      callCount: totalsByKey.get(`${r.sourceLabel}::${r.targetLabel}`) ?? r._count._all,
      lastSeenAt: r._max.occurredAt ?? new Date(0),
    }))
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 8);

  const appsCurrentlyDown = Number(healthDownAppsRows[0]?.count ?? 0);

  return {
    windowHours: TODAY_WINDOW_HOURS,
    criticalNow: {
      openCriticalRisks,
      appsCurrentlyDown,
      failedDeployments24h,
      refusedAgentRuns24h,
      awaitingApproval,
    },
    deploys: deploys.map((d) => ({
      id: d.id,
      appKey: d.app?.appKey ?? null,
      appName: d.app?.name ?? null,
      railwayStatus: d.railwayStatus,
      productionDriftStatus: d.productionDriftStatus,
      liveCommitShortSha: d.liveCommitShortSha,
      checkedAt: d.checkedAt,
    })),
    commits: commits.map((c) => ({
      id: c.id,
      repoFullName: c.repo?.fullName ?? "?",
      sha: c.sha,
      shortSha: c.shortSha,
      message: c.message,
      authorName: c.authorName,
      htmlUrl: c.htmlUrl,
      riskFlags: Array.isArray(c.riskFlagsJson)
        ? (c.riskFlagsJson as string[])
        : [],
      committedAt: c.committedAt,
    })),
    failedWorkflows: failedWorkflows.map((w) => ({
      id: w.id,
      repoFullName: w.repo?.fullName ?? "?",
      name: w.name,
      conclusion: w.conclusion,
      htmlUrl: w.htmlUrl,
      startedAt: w.startedAt,
    })),
    risksOpened: risksOpened.map((r) => ({
      id: r.id,
      severity: r.severity,
      category: r.category,
      title: r.title,
      appKey: r.app?.appKey ?? null,
      appName: r.app?.name ?? null,
      detectedAt: r.detectedAt,
    })),
    risksResolved: risksResolved.map((r) => ({
      id: r.id,
      severity: r.severity,
      category: r.category,
      title: r.title,
      appKey: r.app?.appKey ?? null,
      appName: r.app?.name ?? null,
      resolvedAt: r.resolvedAt,
    })),
    agentRuns: agentRuns,
    trafficErrors,
    awaitingApprovalRuns,
  };
}

/** Total count across all activity sections — used by the AI ask
 *  context assembly + by the page header to decide if the digest is
 *  worth scrolling. */
export function digestActivityTotal(d: TodayDigest): number {
  return (
    d.deploys.length +
    d.commits.length +
    d.failedWorkflows.length +
    d.risksOpened.length +
    d.risksResolved.length +
    d.agentRuns.length +
    d.trafficErrors.length
  );
}
