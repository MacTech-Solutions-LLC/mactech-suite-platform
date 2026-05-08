/**
 * Slice 2 risk rules — derived from repository state, not health probes.
 *
 *   production_behind_main      live build-info.commitSha != GitHub HEAD
 *   failed_workflow             latest workflow on default branch failed
 *   security_sensitive_change   most recent commit touched a sensitive path
 *
 * Pure functions. The risk service reconciles them against existing
 * open OperationalRiskFlag rows for these three categories.
 */

import type { AppRegistry, RiskCategory, RiskSeverity } from "@prisma/client";

export interface DerivedRepoRisk {
  category: RiskCategory;
  severity: RiskSeverity;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface RepoSnapshot {
  /** Live commit SHA reported by the app's /api/build-info. Null if
   *  the app doesn't expose one yet — caller suppresses the
   *  production_behind_main rule in that case. */
  liveCommitSha: string | null;
  /** Default-branch HEAD from GitHub. Null if the repo has not been
   *  synced yet. */
  githubHeadSha: string | null;
  /** ahead_by from GitHub `compare`. */
  commitsBehind: number | null;
  /** Hours since the latest commit landed on the default branch. */
  hoursSinceHeadCommit: number | null;
  /** Latest workflow run on default branch — null if none observed. */
  latestWorkflow:
    | {
        id: string;
        name: string;
        status: string;
        conclusion: string | null;
        htmlUrl: string | null;
        startedAt: Date | null;
      }
    | null;
  /** Risk categories detected on the most recent commit (from
   *  GitCommitEvent.riskFlagsJson). */
  latestCommitRiskCategories: RiskCategory[];
  /** SHA of the most recent commit, for audit metadata. */
  latestCommitSha: string | null;
  latestCommitMessage: string | null;
}

export function evaluateRepoRisks(
  app: AppRegistry,
  snapshot: RepoSnapshot,
): DerivedRepoRisk[] {
  const out: DerivedRepoRisk[] = [];

  // ── production_behind_main ────────────────────────────────────────────
  // Only fire when we have BOTH sides of the comparison. If the app
  // hasn't shipped /api/build-info yet, the missing_build_info flag
  // (slice 3) covers that case — suppress production_behind_main here
  // to avoid double-counting the same gap.
  if (
    snapshot.liveCommitSha &&
    snapshot.githubHeadSha &&
    snapshot.liveCommitSha !== snapshot.githubHeadSha &&
    snapshot.commitsBehind !== null &&
    snapshot.commitsBehind > 0
  ) {
    const sev = severityForBehind(
      snapshot.commitsBehind,
      snapshot.hoursSinceHeadCommit,
      app,
    );
    out.push({
      category: "production_behind_main",
      severity: sev,
      title: `${app.name} is ${snapshot.commitsBehind} commit${snapshot.commitsBehind === 1 ? "" : "s"} behind main`,
      description: `Live deploy is at ${shortSha(snapshot.liveCommitSha)}; default branch is at ${shortSha(snapshot.githubHeadSha)}. Production is ${snapshot.commitsBehind} commits behind${
        snapshot.hoursSinceHeadCommit !== null
          ? ` (${formatHours(snapshot.hoursSinceHeadCommit)} since the latest commit)`
          : ""
      }.`,
      metadata: {
        app_key: app.appKey,
        live_commit_sha: snapshot.liveCommitSha,
        github_head_sha: snapshot.githubHeadSha,
        commits_behind: snapshot.commitsBehind,
        hours_since_head_commit: snapshot.hoursSinceHeadCommit,
      },
    });
  }

  // ── failed_workflow ──────────────────────────────────────────────────
  if (
    snapshot.latestWorkflow &&
    snapshot.latestWorkflow.status === "completed" &&
    snapshot.latestWorkflow.conclusion === "failure"
  ) {
    out.push({
      category: "failed_workflow",
      severity: bumpForCriticality(app.criticality, "medium"),
      title: `${app.name}: workflow ${snapshot.latestWorkflow.name} failed`,
      description: `Latest workflow run on the default branch concluded with failure. ${
        snapshot.latestWorkflow.htmlUrl ?? ""
      }`,
      metadata: {
        app_key: app.appKey,
        workflow_run_id: snapshot.latestWorkflow.id,
        workflow_name: snapshot.latestWorkflow.name,
        conclusion: snapshot.latestWorkflow.conclusion,
        html_url: snapshot.latestWorkflow.htmlUrl,
        started_at: snapshot.latestWorkflow.startedAt,
      },
    });
  }

  // ── security_sensitive_change ────────────────────────────────────────
  if (
    snapshot.latestCommitRiskCategories.includes("security_sensitive_change") &&
    snapshot.latestCommitSha
  ) {
    const inner = snapshot.latestCommitRiskCategories.filter(
      (c) => c !== "security_sensitive_change",
    );
    out.push({
      category: "security_sensitive_change",
      severity: bumpForCriticality(app.criticality, "low"),
      title: `${app.name}: security-sensitive change detected`,
      description: `Latest commit ${shortSha(snapshot.latestCommitSha)} touched: ${inner.join(", ") || "sensitive paths"}.${
        snapshot.latestCommitMessage
          ? ` Message: "${snapshot.latestCommitMessage.split("\n")[0].slice(0, 200)}"`
          : ""
      }`,
      metadata: {
        app_key: app.appKey,
        commit_sha: snapshot.latestCommitSha,
        risk_categories: snapshot.latestCommitRiskCategories,
        commit_message_head: snapshot.latestCommitMessage?.split("\n")[0] ?? null,
      },
    });
  }

  return out;
}

function severityForBehind(
  behind: number,
  hoursSince: number | null,
  app: AppRegistry,
): RiskSeverity {
  // Default scale: 1-2 commits = low; 3+ = medium; 24h+ behind on a
  // mission_critical app = high. App criticality bumps the result.
  const base: "low" | "medium" | "high" =
    behind >= 3 ? "medium" : "low";
  let sev: "low" | "medium" | "high" = base;
  if (
    hoursSince !== null &&
    hoursSince >= 24 &&
    (app.criticality === "mission_critical" || app.criticality === "high")
  ) {
    sev = "high";
  }
  return bumpForCriticality(app.criticality, sev);
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

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
