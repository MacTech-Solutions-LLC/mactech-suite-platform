/**
 * App-detail aggregator — Slice 7.
 *
 * The investigate page (/admin/apps/[appKey]) needs every signal we
 * know about one app in a single payload. Rather than fan that work
 * out across ten components, this service pulls everything in
 * parallel and returns a flat shape the page can render top-to-bottom.
 *
 * Data sources:
 *   - AppRegistry — name, repo, criticality, etc.
 *   - HealthCheckSnapshot — last 12 probes
 *   - DeploymentSnapshot — last 12 (via railway sync)
 *   - GitCommitEvent — last 20
 *   - GitWorkflowRun — last 12
 *   - OperationalRiskFlag — every open
 *   - AgentRun — last 8 that touched this app (intent scope or step input)
 *   - AppDependency — outgoing + incoming declared
 *   - AppCallEvent (24h aggregates) — observed inbound + outbound + per-pair
 *   - GitHub live calls — open PRs, open issues for the linked repo (best-effort)
 *
 * Live GitHub fan-out is fire-and-await but timeouts at 8s so a slow
 * upstream can't stall the page beyond that.
 */

import { prisma } from "@/lib/db/prisma";
import { getGitHubClient } from "@/lib/integrations/github/client";
import { getTrafficSummaryByPair } from "./traffic-service";
import type {
  GitHubIssueSummary,
  GitHubPullRequestSummary,
} from "@/lib/integrations/github/client";

export interface AppDetail {
  app: {
    id: string;
    appKey: string;
    name: string;
    description: string | null;
    category: string;
    criticality: string;
    lifecycle: string;
    visibility: string;
    status: string;
    publicUrl: string | null;
    repoFullName: string | null;
    healthUrl: string | null;
    cloudflareHostname: string | null;
    cloudflareZoneId: string | null;
  };
  health: {
    history: Array<{
      checkedAt: Date;
      status: string;
      latencyMs: number | null;
      statusCode: number | null;
    }>;
    /** Last successful probe; null if app has never returned 2xx. */
    lastUpAt: Date | null;
  };
  deployments: Array<{
    id: string;
    railwayDeploymentId: string;
    railwayStatus: string;
    healthStatus: string | null;
    liveCommitShortSha: string | null;
    productionDriftStatus: string;
    commitsBehind: number | null;
    checkedAt: Date;
  }>;
  recentCommits: Array<{
    id: string;
    sha: string;
    shortSha: string;
    message: string;
    authorName: string | null;
    htmlUrl: string | null;
    /** JSON array of risk flag strings the commit triggered. */
    riskFlagsJson: unknown;
    committedAt: Date | null;
  }>;
  workflowRuns: Array<{
    id: string;
    name: string;
    status: string;
    conclusion: string | null;
    htmlUrl: string | null;
    startedAt: Date | null;
  }>;
  openRisks: Array<{
    id: string;
    severity: string;
    category: string;
    title: string;
    description: string | null;
    detectedAt: Date;
    acknowledgedAt: Date | null;
    acknowledgedBy: string | null;
  }>;
  recentAgentRuns: Array<{
    id: string;
    status: string;
    requestText: string;
    requestedByEmail: string;
    plannedStepCount: number;
    createdAt: Date;
  }>;
  dependencies: {
    outgoing: Array<{
      id: string;
      target: { id: string; appKey: string; name: string };
      dependencyType: string;
      description: string | null;
      criticality: string;
    }>;
    incoming: Array<{
      id: string;
      source: { id: string; appKey: string; name: string };
      dependencyType: string;
      description: string | null;
      criticality: string;
    }>;
  };
  traffic: {
    /** Inbound — every (sourceLabel) → this app pair in the last 24h. */
    inbound: Array<{
      sourceLabel: string;
      callCount: number;
      bytesIn: number;
      errorCount: number;
      lastSeenAt: Date;
    }>;
    /** Outbound — this app → every (targetLabel) pair in the last 24h. */
    outbound: Array<{
      targetLabel: string;
      callCount: number;
      bytesIn: number;
      errorCount: number;
      lastSeenAt: Date;
    }>;
    windowHours: number;
  };
  github:
    | { configured: false }
    | {
        configured: true;
        repoFullName: string;
        openPRs: GitHubPullRequestSummary[];
        openIssues: GitHubIssueSummary[];
        /** Set when one of the live calls failed; the panels render
         *  "couldn't load" inline rather than block the page. */
        warnings: string[];
      };
}

export async function getAppDetail(appKey: string): Promise<AppDetail | null> {
  const app = await prisma.appRegistry.findUnique({ where: { appKey } });
  if (!app) return null;

  const TRAFFIC_WINDOW_HOURS = 24;
  const since = new Date(Date.now() - TRAFFIC_WINDOW_HOURS * 60 * 60 * 1000);

  // Pull everything we have in DB in parallel.
  const [
    healthRows,
    lastUpRow,
    deploymentRows,
    commits,
    runs,
    risks,
    agentRuns,
    outgoingDeps,
    incomingDeps,
    inboundTraffic,
    outboundTraffic,
  ] = await Promise.all([
    prisma.healthCheckSnapshot.findMany({
      where: { appRegistryId: app.id },
      orderBy: { checkedAt: "desc" },
      take: 12,
      select: {
        checkedAt: true,
        status: true,
        latencyMs: true,
        statusCode: true,
      },
    }),
    prisma.healthCheckSnapshot.findFirst({
      where: { appRegistryId: app.id, status: "up" },
      orderBy: { checkedAt: "desc" },
      select: { checkedAt: true },
    }),
    prisma.deploymentSnapshot.findMany({
      where: { appRegistryId: app.id },
      orderBy: { checkedAt: "desc" },
      take: 12,
    }),
    prisma.gitCommitEvent.findMany({
      where: {
        repo: app.repoFullName ? { fullName: app.repoFullName } : undefined,
      },
      orderBy: { committedAt: "desc" },
      take: 20,
      select: {
        id: true,
        sha: true,
        shortSha: true,
        message: true,
        authorName: true,
        htmlUrl: true,
        riskFlagsJson: true,
        committedAt: true,
      },
    }),
    prisma.gitWorkflowRun.findMany({
      where: {
        repo: app.repoFullName ? { fullName: app.repoFullName } : undefined,
      },
      orderBy: { startedAt: "desc" },
      take: 12,
      select: {
        id: true,
        name: true,
        status: true,
        conclusion: true,
        htmlUrl: true,
        startedAt: true,
      },
    }),
    prisma.operationalRiskFlag.findMany({
      where: { appRegistryId: app.id, status: "open" },
      orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
      select: {
        id: true,
        severity: true,
        category: true,
        title: true,
        description: true,
        detectedAt: true,
        acknowledgedAt: true,
        acknowledgedBy: true,
      },
    }),
    // Agent runs that named this app in their declared scope OR whose
    // any step's inputJson contained the appId. We do the cheap check
    // (intentScopeAppIds array contains) here; the input-json case
    // is harder to query and is a future enrichment.
    prisma.agentRun.findMany({
      where: { intentScopeAppIds: { has: app.id } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        requestText: true,
        requestedByEmail: true,
        plannedStepCount: true,
        createdAt: true,
      },
    }),
    prisma.appDependency.findMany({
      where: { sourceAppRegistryId: app.id },
      include: { target: { select: { id: true, appKey: true, name: true } } },
      orderBy: [{ criticality: "desc" }, { dependencyType: "asc" }],
    }),
    prisma.appDependency.findMany({
      where: { targetAppRegistryId: app.id },
      include: { source: { select: { id: true, appKey: true, name: true } } },
      orderBy: [{ criticality: "desc" }, { dependencyType: "asc" }],
    }),
    getTrafficSummaryByPair({ since, targetAppRegistryId: app.id }),
    getTrafficSummaryByPair({ since, sourceAppRegistryId: app.id }),
  ]);

  // GitHub live calls — best-effort, timeout-bounded inside the
  // client. Only run when the app has a repo + the client is wired.
  const gh = getGitHubClient();
  let github: AppDetail["github"];
  if (!app.repoFullName || !gh.configured) {
    github = { configured: false };
  } else {
    const [owner, repoName] = app.repoFullName.split("/");
    const warnings: string[] = [];
    const [prResult, issueResult] = await Promise.all([
      gh.listOpenPullRequests(owner, repoName, 15),
      gh.listOpenIssues(owner, repoName, 15),
    ]);
    const openPRs = prResult.ok ? prResult.data : [];
    if (!prResult.ok) warnings.push(`pulls: ${prResult.reason}`);
    const openIssues = issueResult.ok ? issueResult.data : [];
    if (!issueResult.ok) warnings.push(`issues: ${issueResult.reason}`);
    github = {
      configured: true,
      repoFullName: app.repoFullName,
      openPRs,
      openIssues,
      warnings,
    };
  }

  return {
    app: {
      id: app.id,
      appKey: app.appKey,
      name: app.name,
      description: app.description,
      category: app.category,
      criticality: app.criticality,
      lifecycle: app.lifecycle,
      visibility: app.visibility,
      status: app.status,
      publicUrl: app.publicUrl,
      repoFullName: app.repoFullName,
      healthUrl: app.healthUrl,
      cloudflareHostname: app.cloudflareHostname,
      cloudflareZoneId: app.cloudflareZoneId,
    },
    health: {
      history: healthRows.reverse(), // chart-ready: oldest → newest
      lastUpAt: lastUpRow?.checkedAt ?? null,
    },
    deployments: deploymentRows.map((d) => ({
      id: d.id,
      railwayDeploymentId: d.railwayDeploymentId,
      railwayStatus: d.railwayStatus,
      healthStatus: d.healthStatus,
      liveCommitShortSha: d.liveCommitShortSha,
      productionDriftStatus: d.productionDriftStatus,
      commitsBehind: d.commitsBehind,
      checkedAt: d.checkedAt,
    })),
    recentCommits: commits,
    workflowRuns: runs,
    openRisks: risks,
    recentAgentRuns: agentRuns,
    dependencies: {
      outgoing: outgoingDeps.map((d) => ({
        id: d.id,
        target: d.target,
        dependencyType: d.dependencyType,
        description: d.description,
        criticality: d.criticality,
      })),
      incoming: incomingDeps.map((d) => ({
        id: d.id,
        source: d.source,
        dependencyType: d.dependencyType,
        description: d.description,
        criticality: d.criticality,
      })),
    },
    traffic: {
      inbound: inboundTraffic.map((t) => ({
        sourceLabel: t.sourceLabel,
        callCount: t.callCount,
        bytesIn: t.bytesIn,
        errorCount: t.errorCount,
        lastSeenAt: t.lastSeenAt,
      })),
      outbound: outboundTraffic.map((t) => ({
        targetLabel: t.targetLabel,
        callCount: t.callCount,
        bytesIn: t.bytesIn,
        errorCount: t.errorCount,
        lastSeenAt: t.lastSeenAt,
      })),
      windowHours: TRAFFIC_WINDOW_HOURS,
    },
    github,
  };
}
