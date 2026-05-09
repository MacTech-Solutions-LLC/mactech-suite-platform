/**
 * AgentOps capability registry — Slice 5.
 *
 * The planner is allowed to invoke ONLY capabilities listed here. The
 * registry is code-defined (not DB-backed) so an unauthorized DB write
 * cannot widen the agent's authority. Each capability is a thin wrapper
 * over an existing Command Center service method; the agent runtime is
 * not allowed to make arbitrary HTTP, SQL, or shell calls.
 *
 * Conventions:
 *   - read_only capabilities run on plan execute without a second
 *     approval (the requester already holds the underlying read perm).
 *   - approval_required capabilities require an explicit AgentApproval
 *     row by a user who holds platform:agents:approve, and that user
 *     cannot be the same as the requester (separation of duties — this
 *     is enforced inside lib/agents/orchestrator.ts).
 *   - Inputs are validated against `inputSchema.required`. Anything not
 *     listed is dropped silently before persistence.
 *   - Every capability writes its own AuditLog row inside its handler;
 *     the orchestrator additionally writes an envelope audit row for
 *     plan/approval/run lifecycle events.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { open_repo_pull_request } from "../cross-repo/capability";
import {
  getOpenRiskFlags,
  getAppOperationalSnapshots,
} from "@/lib/services/command-center/command-center-service";
import {
  getRecentCommitsAcrossRepos,
  getRecentWorkflowRuns,
  getRepositorySnapshots,
} from "@/lib/services/command-center/repo-intelligence-service";
import {
  getDeploymentSnapshots,
  getRecentHealthCheckHistory,
} from "@/lib/services/command-center/deployment-intelligence-service";
import { getEcosystemGraph } from "@/lib/services/command-center/ecosystem-graph-service";
import {
  generateCommitSummary,
  getRecentCommitSummaries,
} from "@/lib/services/command-center/commit-summary-service";
import {
  acknowledgeRisk,
  reconcileRisksForApp,
} from "@/lib/services/command-center/risk-service";
import { syncRepositoryByFullName } from "@/lib/services/command-center/github-sync-service";
import { syncRailwayResourceForApp } from "@/lib/services/command-center/railway-sync-service";
import { getGitHubClient } from "@/lib/integrations/github/client";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { requirePlatformPermission } from "@/lib/authz";
import type { Capability, CapabilityResult } from "../types";

// ───────────────────────────────────────────────────────────────────────────
// Read-only capabilities. Run automatically once a plan is created (the
// requester already holds the underlying read permission). They never
// touch external systems for writes — only fetch + summarize.
// ───────────────────────────────────────────────────────────────────────────

const summarize_open_risks: Capability = {
  key: "summarize_open_risks",
  kind: "read_only",
  label: "Summarize open operational risks",
  description:
    "Returns the current OperationalRiskFlag table grouped by severity + category. Read-only.",
  inputSchema: { required: [], optional: ["limit"] },
  requesterPermission: PLATFORM_PERMISSIONS.RISK_VIEW,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.RISK_VIEW);
    const limit = typeof input.limit === "number" ? input.limit : 50;
    const flags = await getOpenRiskFlags(limit);
    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const f of flags) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    }
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: summarize_open_risks (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: { capability: "summarize_open_risks", count: flags.length },
    });
    const md =
      flags.length === 0
        ? "# Open risks\n\nNone."
        : `# Open risks (${flags.length})\n\n${flags
            .map(
              (f) =>
                `- **[${f.severity}]** ${f.app?.name ?? "?"} / ${f.category}: ${f.title}`,
            )
            .join("\n")}`;
    return {
      summary: { count: flags.length, bySeverity, byCategory },
      artifacts: [
        { kind: "risk_summary", title: `Open risks (${flags.length})`, bodyMarkdown: md },
      ],
    };
  },
};

const summarize_app_status: Capability = {
  key: "summarize_app_status",
  kind: "read_only",
  label: "Summarize app status across the ecosystem",
  description:
    "Returns the AppRegistry overview: which apps are healthy/degraded/down per the latest HealthCheckSnapshot.",
  inputSchema: { required: [], optional: [] },
  requesterPermission: PLATFORM_PERMISSIONS.OPS_VIEW,
  async invoke(_input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
    const snaps = await getAppOperationalSnapshots();
    const counts: Record<string, number> = { up: 0, degraded: 0, down: 0, unknown: 0 };
    for (const s of snaps) {
      const k = s.latestHealth?.status ?? "unknown";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: summarize_app_status (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: { capability: "summarize_app_status", apps: snaps.length },
    });
    const md = `# App status\n\n${snaps
      .map(
        (s) =>
          `- **${s.app.name}** (${s.app.appKey}): ${s.latestHealth?.status ?? "unknown"}`,
      )
      .join("\n")}`;
    return {
      summary: { apps: snaps.length, ...counts },
      artifacts: [
        { kind: "app_status_summary", title: "App status snapshot", bodyMarkdown: md },
      ],
    };
  },
};

const summarize_deployment_drift: Capability = {
  key: "summarize_deployment_drift",
  kind: "read_only",
  label: "Summarize deployment drift across repos",
  description:
    "Compares the latest production DeploymentSnapshot to main on every linked repo and returns the drift list.",
  inputSchema: { required: [], optional: [] },
  requesterPermission: PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW,
  async invoke(_input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW);
    const rows = await getDeploymentSnapshots();
    type DriftRow = (typeof rows)[number];
    const drift = rows.filter(
      (r: DriftRow) =>
        r.latestSnapshot &&
        r.latestSnapshot.productionDriftStatus !== "in_sync" &&
        r.latestSnapshot.productionDriftStatus !== "unknown",
    );
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: summarize_deployment_drift (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: { capability: "summarize_deployment_drift", drift: drift.length },
    });
    const md =
      drift.length === 0
        ? "# Deployment drift\n\nEvery linked repo is in sync."
        : `# Deployment drift\n\n${drift
            .map(
              (r) =>
                `- **${r.app?.name ?? "?"}** — ${r.latestSnapshot?.productionDriftStatus} (${r.latestSnapshot?.commitsBehind ?? "?"} commits behind)`,
            )
            .join("\n")}`;
    return {
      summary: { total: rows.length, drift: drift.length },
      artifacts: [
        {
          kind: "deployment_drift_summary",
          title: "Deployment drift snapshot",
          bodyMarkdown: md,
        },
      ],
    };
  },
};

const summarize_repo_activity: Capability = {
  key: "summarize_repo_activity",
  kind: "read_only",
  label: "Summarize recent repository activity",
  description:
    "Lists recent commits + workflow runs across linked repos. Pass limit to control how many of each.",
  inputSchema: { required: [], optional: ["limit"] },
  requesterPermission: PLATFORM_PERMISSIONS.REPOSITORIES_VIEW,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
    const take = typeof input.limit === "number" ? Math.min(input.limit, 100) : 30;
    const [commits, runs] = await Promise.all([
      getRecentCommitsAcrossRepos({ take }),
      getRecentWorkflowRuns({ take }),
    ]);
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: summarize_repo_activity (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: {
        capability: "summarize_repo_activity",
        commits: commits.length,
        runs: runs.length,
      },
    });
    const md = `# Repo activity\n\n## Commits (${commits.length})\n${commits
      .slice(0, 20)
      .map(
        (c) =>
          `- \`${c.shortSha}\` ${(c.message ?? "").split("\n")[0]} — ${c.repo?.fullName ?? ""}`,
      )
      .join("\n")}\n\n## Workflow runs (${runs.length})\n${runs
      .slice(0, 20)
      .map(
        (r) =>
          `- ${r.name ?? ""} — ${r.conclusion ?? r.status} — ${r.repo?.fullName ?? ""}`,
      )
      .join("\n")}`;
    return {
      summary: { commits: commits.length, workflowRuns: runs.length },
      artifacts: [
        { kind: "audit_summary", title: "Repo activity", bodyMarkdown: md },
      ],
    };
  },
};

const inspect_failed_workflows: Capability = {
  key: "inspect_failed_workflows",
  kind: "read_only",
  label: "Inspect failing workflow runs",
  description:
    "Returns the most recent workflow runs whose conclusion is failure / timed_out / startup_failure.",
  inputSchema: { required: [], optional: ["limit"] },
  requesterPermission: PLATFORM_PERMISSIONS.REPOSITORIES_VIEW,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
    const limit = typeof input.limit === "number" ? Math.min(input.limit, 100) : 25;
    const runs = await prisma.gitWorkflowRun.findMany({
      where: { conclusion: { in: ["failure", "timed_out", "startup_failure"] } },
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { repo: { select: { fullName: true } } },
    });
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: inspect_failed_workflows (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: { capability: "inspect_failed_workflows", count: runs.length },
    });
    return {
      summary: { count: runs.length },
      artifacts: [
        {
          kind: "audit_summary",
          title: `Failing workflow runs (${runs.length})`,
          bodyMarkdown: `# Failing workflow runs\n\n${runs
            .map(
              (r) =>
                `- **${r.repo?.fullName ?? "?"}** — ${r.name} — ${r.conclusion} — ${r.htmlUrl ?? ""}`,
            )
            .join("\n")}`,
        },
      ],
    };
  },
};

const inspect_failed_deployments: Capability = {
  key: "inspect_failed_deployments",
  kind: "read_only",
  label: "Inspect failing deployments",
  description:
    "Returns the most recent DeploymentSnapshot rows whose railwayStatus is in a non-success state.",
  inputSchema: { required: [], optional: ["limit"] },
  requesterPermission: PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW);
    const limit = typeof input.limit === "number" ? Math.min(input.limit, 100) : 25;
    const snaps = await prisma.deploymentSnapshot.findMany({
      where: { railwayStatus: { in: ["failed", "crashed"] } },
      orderBy: { checkedAt: "desc" },
      take: limit,
      include: { app: { select: { appKey: true, name: true } } },
    });
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: inspect_failed_deployments (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: { capability: "inspect_failed_deployments", count: snaps.length },
    });
    return {
      summary: { count: snaps.length },
      artifacts: [
        {
          kind: "deployment_drift_summary",
          title: `Failing deployments (${snaps.length})`,
          bodyMarkdown: `# Failing deployments\n\n${snaps
            .map(
              (s) =>
                `- **${s.app?.name ?? "?"}** — ${s.railwayStatus} — ${s.liveCommitShortSha ?? "?"}`,
            )
            .join("\n")}`,
        },
      ],
    };
  },
};

const inspect_health_failures: Capability = {
  key: "inspect_health_failures",
  kind: "read_only",
  label: "Inspect recent health-check failures",
  description:
    "Returns apps whose latest HealthCheckSnapshot is degraded or down.",
  inputSchema: { required: [], optional: ["limit"] },
  requesterPermission: PLATFORM_PERMISSIONS.OPS_VIEW,
  async invoke(_input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
    const rows = await getRecentHealthCheckHistory(8);
    type HistoryRow = (typeof rows)[number];
    const failing = rows.filter((r: HistoryRow) => {
      const latest = r.snapshots[0];
      return latest && (latest.status === "degraded" || latest.status === "down");
    });
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: inspect_health_failures (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: { capability: "inspect_health_failures", failing: failing.length },
    });
    return {
      summary: { failing: failing.length, total: rows.length },
      artifacts: [
        {
          kind: "health_summary",
          title: `Health failures (${failing.length})`,
          bodyMarkdown: `# Health failures\n\n${failing
            .map((r) => `- **${r.app.name}** — ${r.snapshots[0]?.status ?? "unknown"}`)
            .join("\n")}`,
        },
      ],
    };
  },
};

const read_ecosystem_graph: Capability = {
  key: "read_ecosystem_graph",
  kind: "read_only",
  label: "Read ecosystem graph (apps + dependencies)",
  description:
    "Returns the full ecosystem graph: nodes (apps + health) and edges (declared AppDependency rows).",
  inputSchema: { required: [], optional: [] },
  requesterPermission: PLATFORM_PERMISSIONS.OPS_VIEW,
  async invoke(_input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
    const g = await getEcosystemGraph();
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: read_ecosystem_graph (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: {
        capability: "read_ecosystem_graph",
        nodes: g.nodes.length,
        edges: g.edges.length,
      },
    });
    return {
      summary: { nodes: g.nodes.length, edges: g.edges.length },
      artifacts: [
        {
          kind: "raw_json",
          title: "Ecosystem graph",
          bodyMarkdown: `\`\`\`json\n${JSON.stringify(g, null, 2)}\n\`\`\``,
          payloadJson: g as unknown as Record<string, unknown>,
        },
      ],
    };
  },
};

const summarize_recent_release_notes: Capability = {
  key: "summarize_recent_release_notes",
  kind: "read_only",
  label: "List recent release-note summaries",
  description: "Returns the most recent CommitSummary rows.",
  inputSchema: { required: [], optional: ["limit", "appId"] },
  requesterPermission: PLATFORM_PERMISSIONS.REPOSITORIES_VIEW,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
    const summaries = await getRecentCommitSummaries({
      take: typeof input.limit === "number" ? input.limit : 10,
      appRegistryId: typeof input.appId === "string" ? input.appId : undefined,
    });
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: summarize_recent_release_notes (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: { capability: "summarize_recent_release_notes", count: summaries.length },
    });
    return {
      summary: { count: summaries.length },
      artifacts: [
        {
          kind: "release_notes",
          title: `Recent release notes (${summaries.length})`,
          bodyMarkdown: `# Recent release notes\n\n${summaries
            .map(
              (s) =>
                `## ${s.summaryType} — ${s.app?.name ?? s.gitRepositoryId ?? "?"}\n\n${s.executiveSummary}`,
            )
            .join("\n\n")}`,
        },
      ],
    };
  },
};

const list_repositories: Capability = {
  key: "list_repositories",
  kind: "read_only",
  label: "List linked repositories",
  description: "Returns the GitRepository roster + last-seen commit per repo.",
  inputSchema: { required: [], optional: [] },
  requesterPermission: PLATFORM_PERMISSIONS.REPOSITORIES_VIEW,
  async invoke(_input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
    const snaps = await getRepositorySnapshots();
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: list_repositories (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: { capability: "list_repositories", count: snaps.length },
    });
    return {
      summary: { count: snaps.length },
      artifacts: [
        {
          kind: "raw_json",
          title: `Repositories (${snaps.length})`,
          bodyMarkdown: `\`\`\`json\n${JSON.stringify(
            snaps.map((s) => ({
              fullName: s.repo.fullName,
              latestSha: s.latestCommit?.shortSha,
            })),
            null,
            2,
          )}\n\`\`\``,
        },
      ],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Approval-required capabilities. These are emitted by the planner but
// cannot execute until an AgentApproval row exists, written by a user
// holding platform:agents:approve who is NOT the requester. Separation
// of duties is enforced inside lib/agents/orchestrator.ts.
// ───────────────────────────────────────────────────────────────────────────

const generate_release_notes: Capability = {
  key: "generate_release_notes",
  kind: "approval_required",
  label: "Generate a release-notes summary",
  description:
    "Generates a CommitSummary row covering the recent commit range for one app. Idempotent on (appId, summaryType, headSha).",
  inputSchema: { required: ["appId"], optional: ["summaryType"] },
  requesterPermission: PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE,
  async invoke(input, ctx): Promise<CapabilityResult> {
    const auth = await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE);
    const appRegistryId = String(input.appId);
    const summaryType = (typeof input.summaryType === "string"
      ? input.summaryType
      : "manual") as "manual" | "daily" | "weekly" | "release";
    const result = await generateCommitSummary(auth, { appRegistryId, summaryType });
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: generate_release_notes (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      appRegistryId,
      resourceType: "commit_summary",
      resourceId: result?.summary.id ?? null,
      metadata: { capability: "generate_release_notes", summaryType },
    });
    return {
      summary: {
        commitSummaryId: result?.summary.id ?? null,
        aiAugmented: result?.aiAugmented ?? false,
        summaryType,
      },
      artifacts: result
        ? [
            {
              kind: "release_notes",
              title: `Release notes — ${summaryType}`,
              bodyMarkdown: `# ${summaryType}\n\n## Executive\n${result.summary.executiveSummary}\n\n## Technical\n${result.summary.technicalSummary}`,
            },
          ]
        : [],
    };
  },
};

const acknowledge_risk_flag: Capability = {
  key: "acknowledge_risk_flag",
  kind: "approval_required",
  label: "Acknowledge an open risk flag",
  description:
    "Marks an OperationalRiskFlag as acknowledged. The flag remains visible until its underlying condition clears.",
  inputSchema: { required: ["riskId"], optional: [] },
  requesterPermission: PLATFORM_PERMISSIONS.RISK_MANAGE,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.RISK_MANAGE);
    const riskId = String(input.riskId);
    const updated = await acknowledgeRisk(riskId, ctx.requesterEmail);
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: acknowledge_risk_flag (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "operational_risk_flag",
      resourceId: riskId,
      metadata: {
        capability: "acknowledge_risk_flag",
        approverEmail: ctx.approverEmail,
        ok: Boolean(updated),
      },
    });
    return {
      summary: { riskId, ok: Boolean(updated), status: updated?.status ?? null },
    };
  },
};

const trigger_repo_sync: Capability = {
  key: "trigger_repo_sync",
  kind: "approval_required",
  label: "Trigger a repository sync",
  description:
    "Pulls fresh commits + workflow runs for one GitRepository row. Useful when GitHub webhook delivery dropped.",
  inputSchema: { required: ["repoFullName"], optional: [] },
  requesterPermission: PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE,
  async invoke(input, ctx): Promise<CapabilityResult> {
    const auth = await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE);
    const repoFullName = String(input.repoFullName);
    const result = await syncRepositoryByFullName(auth, repoFullName);
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: trigger_repo_sync (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "git_repository",
      resourceId: repoFullName,
      metadata: { capability: "trigger_repo_sync", approverEmail: ctx.approverEmail },
    });
    return {
      summary: {
        repoFullName,
        commitsInserted: result?.commitsInserted ?? 0,
        workflowRunsUpserted: result?.workflowRunsUpserted ?? 0,
      },
    };
  },
};

const trigger_railway_sync: Capability = {
  key: "trigger_railway_sync",
  kind: "approval_required",
  label: "Trigger a Railway resource sync",
  description:
    "Pulls fresh deployment snapshots for one app from Railway. Useful when a Railway webhook dropped.",
  inputSchema: { required: ["appId"], optional: [] },
  requesterPermission: PLATFORM_PERMISSIONS.DEPLOYMENTS_MANAGE,
  async invoke(input, ctx): Promise<CapabilityResult> {
    const auth = await requirePlatformPermission(PLATFORM_PERMISSIONS.DEPLOYMENTS_MANAGE);
    const appId = String(input.appId);
    const result = await syncRailwayResourceForApp(auth, appId);
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: trigger_railway_sync (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      appRegistryId: appId,
      resourceType: "railway_resource",
      resourceId: appId,
      metadata: { capability: "trigger_railway_sync", approverEmail: ctx.approverEmail },
    });
    return {
      summary: {
        appId,
        snapshotId: result?.snapshotId ?? null,
        warnings: result?.warnings ?? [],
      },
    };
  },
};

const trigger_reconciliation: Capability = {
  key: "trigger_reconciliation",
  kind: "approval_required",
  label: "Trigger risk reconciliation for an app",
  description:
    "Runs the operational-risk reconciliation pass for one app: opens flags for new risks, closes resolved ones.",
  inputSchema: { required: ["appId"], optional: [] },
  requesterPermission: PLATFORM_PERMISSIONS.RISK_MANAGE,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.RISK_MANAGE);
    const appId = String(input.appId);
    const app = await prisma.appRegistry.findUnique({ where: { id: appId } });
    if (!app) {
      return { summary: { appId, ok: false, reason: "app_not_found" } };
    }
    const result = await reconcileRisksForApp({ app, probe: null });
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: trigger_reconciliation (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      appRegistryId: appId,
      resourceType: "operational_risk_flag",
      metadata: {
        capability: "trigger_reconciliation",
        opened: result.opened.length,
        resolved: result.resolved.length,
        approverEmail: ctx.approverEmail,
      },
    });
    return {
      summary: {
        appId,
        opened: result.opened.length,
        resolved: result.resolved.length,
        refreshed: result.refreshed.length,
      },
    };
  },
};

const create_github_issue: Capability = {
  key: "create_github_issue",
  kind: "approval_required",
  label: "Create a GitHub issue",
  description:
    "Opens a new issue on a linked GitRepository. The body is whatever the planner produced; reviewers triage on GitHub.",
  inputSchema: { required: ["repoFullName", "title", "body"], optional: ["labels"] },
  requesterPermission: PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE);
    const repoFullName = String(input.repoFullName);
    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      return { summary: { ok: false, reason: "invalid_repo_full_name" } };
    }
    const labels = Array.isArray(input.labels)
      ? input.labels.filter((l): l is string => typeof l === "string")
      : undefined;
    const gh = getGitHubClient();
    if (!gh.configured) {
      return { summary: { ok: false, reason: "github_not_configured" } };
    }
    const result = await gh.createIssue(owner, repo, {
      title: String(input.title),
      body: String(input.body),
      labels,
    });
    if (!result.ok) {
      await writeAuditLog({
        eventType: "agent.capability.invoked",
        eventCategory: "system",
        severity: "warning",
        action: `agent: create_github_issue failed (run ${ctx.agentRunId}, ${result.reason})`,
        actorEmail: ctx.requesterEmail,
        resourceType: "github_issue",
        resourceId: repoFullName,
        metadata: {
          capability: "create_github_issue",
          ok: false,
          reason: result.reason,
          status: result.status,
        },
      });
      return { summary: { ok: false, reason: result.reason } };
    }
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: create_github_issue #${result.data.number} (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "github_issue",
      resourceId: `${repoFullName}#${result.data.number}`,
      metadata: {
        capability: "create_github_issue",
        approverEmail: ctx.approverEmail,
        issueNumber: result.data.number,
        htmlUrl: result.data.htmlUrl,
      },
    });
    return {
      summary: {
        ok: true,
        issueNumber: result.data.number,
        htmlUrl: result.data.htmlUrl,
      },
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Slice 8: AI ask + team email capabilities.
// ───────────────────────────────────────────────────────────────────────────

const ai_summarize_dashboard: Capability = {
  key: "ai_summarize_dashboard",
  kind: "read_only",
  label: "AI-summarize a dashboard with custom prompt",
  description:
    "Runs an AI ask grounded in one of the Command Center dashboards (commit_intelligence | open_risks | ecosystem | deployment_drift | workflow_failures). Prompt + contextKey are operator-supplied. Returns the AI narrative; does NOT email.",
  inputSchema: {
    required: ["contextKey", "prompt"],
    optional: ["appKey"],
  },
  requesterPermission: PLATFORM_PERMISSIONS.OPS_VIEW,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
    const contextKey = String(input.contextKey);
    const prompt = String(input.prompt);
    const appKey = typeof input.appKey === "string" ? input.appKey : undefined;
    const { ask } = await import("@/lib/services/command-center/ai-ask-service");
    const result = await ask({
      contextKey: contextKey as never,
      prompt,
      appKey,
      sendToTeam: false,
      actorClerkUserId: ctx.requesterClerkUserId,
      actorEmail: ctx.requesterEmail,
    });
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: ai_summarize_dashboard ${contextKey} (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: { capability: "ai_summarize_dashboard", contextKey },
    });
    return {
      summary: {
        contextKey,
        contextChars: result.contextChars,
        llmAvailable: result.llmAvailable,
        answerLength: result.answer.length,
      },
      artifacts: [
        {
          kind: "audit_summary",
          title: `AI summary — ${contextKey}`,
          bodyMarkdown: `# Question\n\n${prompt}\n\n# Answer\n\n${result.answer}`,
        },
      ],
    };
  },
};

const email_team_summary: Capability = {
  key: "email_team_summary",
  kind: "approval_required",
  label: "Email an AI summary to the team",
  description:
    "Runs an AI ask AND emails the answer to the configured team recipients (TEAM_EMAILS env var or operator override). Approval-required because broadcasting to leadership has the same blast radius as a write capability. No email is sent if RESEND_API_KEY is not configured server-side; the agent run still completes with the rendered narrative as an artifact.",
  inputSchema: {
    required: ["contextKey", "prompt"],
    optional: ["appKey", "recipients"],
  },
  requesterPermission: PLATFORM_PERMISSIONS.OPS_VIEW,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
    const contextKey = String(input.contextKey);
    const prompt = String(input.prompt);
    const appKey = typeof input.appKey === "string" ? input.appKey : undefined;
    const recipients = Array.isArray(input.recipients)
      ? input.recipients.filter((r): r is string => typeof r === "string")
      : undefined;
    const { ask } = await import("@/lib/services/command-center/ai-ask-service");
    const result = await ask({
      contextKey: contextKey as never,
      prompt,
      appKey,
      recipients,
      sendToTeam: true,
      actorClerkUserId: ctx.requesterClerkUserId,
      actorEmail: ctx.requesterEmail,
    });
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: email_team_summary ${contextKey} (run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "agent_run",
      resourceId: ctx.agentRunId,
      metadata: {
        capability: "email_team_summary",
        contextKey,
        approverEmail: ctx.approverEmail,
        emailSent: result.email?.sent ?? false,
        emailRecipients: result.email?.recipients.length ?? 0,
        emailSkippedReason: result.email?.skippedReason ?? null,
      },
    });
    return {
      summary: {
        contextKey,
        emailSent: result.email?.sent ?? false,
        recipients: result.email?.recipients.length ?? 0,
        skippedReason: result.email?.skippedReason ?? null,
        messageId: result.email?.messageId ?? null,
      },
      artifacts: [
        {
          kind: "audit_summary",
          title: `Email — ${contextKey}`,
          bodyMarkdown: `# Question\n\n${prompt}\n\n# Answer\n\n${result.answer}\n\n# Email\n\nSent: ${
            result.email?.sent ? "yes" : "no"
          }${result.email?.sent ? `\nRecipients: ${result.email.recipients.join(", ")}` : ""}${
            result.email?.skippedReason ? `\nSkipped reason: ${result.email.skippedReason}` : ""
          }`,
        },
      ],
    };
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Registry exports.
// ───────────────────────────────────────────────────────────────────────────

const ALL: Capability[] = [
  // read-only
  summarize_open_risks,
  summarize_app_status,
  summarize_deployment_drift,
  summarize_repo_activity,
  inspect_failed_workflows,
  inspect_failed_deployments,
  inspect_health_failures,
  read_ecosystem_graph,
  summarize_recent_release_notes,
  list_repositories,
  ai_summarize_dashboard,
  // approval-required
  email_team_summary,
  generate_release_notes,
  acknowledge_risk_flag,
  trigger_repo_sync,
  trigger_railway_sync,
  trigger_reconciliation,
  create_github_issue,
  // Slice 13: cross-repo patch agent. Lives in its own module.
  open_repo_pull_request,
];

const BY_KEY = new Map<string, Capability>(ALL.map((c) => [c.key, c]));

/**
 * Look up a capability by key. Returns null if the key is not registered;
 * the planner output validator uses this to reject unknown capabilities
 * before they reach the orchestrator.
 */
export function getCapability(key: string): Capability | null {
  return BY_KEY.get(key) ?? null;
}

export function listCapabilities(): readonly Capability[] {
  return ALL;
}
