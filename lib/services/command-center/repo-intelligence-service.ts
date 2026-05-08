/**
 * Read-side queries that hydrate the Repository pages.
 *
 *   getRepositorySnapshots()        - /admin/repositories table
 *   getRecentCommitsAcrossRepos()   - /admin/repositories/commits feed
 *   getRecentWorkflowRuns()         - /admin/repositories/workflow-runs
 *   getRepoSnapshotForApp()         - input to the repo risk evaluator
 *
 * Pure read functions; permission gating happens in the route + page
 * via requirePlatformPermission(REPOSITORIES_VIEW).
 */

import { prisma } from "@/lib/db/prisma";
import {
  getGitHubClient,
  type GitHubClient,
} from "@/lib/integrations/github/client";
import type { RepoSnapshot } from "@/lib/integrations/risk/repo-evaluator";
import type {
  AppRegistry,
  GitCommitEvent,
  GitRepository,
  GitWorkflowRun,
  RiskCategory,
} from "@prisma/client";

export interface RepositorySnapshotRow {
  repo: GitRepository;
  apps: Array<{ id: string; appKey: string; name: string }>;
  latestCommit: GitCommitEvent | null;
  latestWorkflow: GitWorkflowRun | null;
  /** Aggregate counter for the table column. */
  openRepoRiskCount: number;
}

/** Hydrated rows for /admin/repositories. Sorted by lastSyncedAt
 *  desc — freshest first. */
export async function getRepositorySnapshots(): Promise<RepositorySnapshotRow[]> {
  const repos = await prisma.gitRepository.findMany({
    where: { active: true },
    orderBy: [{ lastSyncedAt: "desc" }, { fullName: "asc" }],
    include: {
      appLinks: {
        include: { app: { select: { id: true, appKey: true, name: true } } },
      },
      commits: {
        orderBy: { committedAt: "desc" },
        take: 1,
      },
      workflowRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  // Open risk count per repo — count rows whose appRegistryId maps to
  // any of this repo's linked apps. Cheap; tables are small.
  const linkedAppIdsByRepo = new Map<string, string[]>(
    repos.map((r) => [r.id, r.appLinks.map((l) => l.app.id)]),
  );
  const allLinkedAppIds = Array.from(
    new Set(Array.from(linkedAppIdsByRepo.values()).flat()),
  );
  const riskCounts = allLinkedAppIds.length
    ? await prisma.operationalRiskFlag.groupBy({
        by: ["appRegistryId"],
        where: {
          status: "open",
          appRegistryId: { in: allLinkedAppIds },
          category: {
            in: ["production_behind_main", "failed_workflow", "security_sensitive_change"],
          },
        },
        _count: { _all: true },
      })
    : [];
  const countByApp = new Map(
    riskCounts.map((c) => [c.appRegistryId!, c._count._all]),
  );

  return repos.map((r) => {
    const linkedApps = r.appLinks.map((l) => l.app);
    const openRepoRiskCount = linkedApps.reduce(
      (sum, a) => sum + (countByApp.get(a.id) ?? 0),
      0,
    );
    return {
      repo: r,
      apps: linkedApps,
      latestCommit: r.commits[0] ?? null,
      latestWorkflow: r.workflowRuns[0] ?? null,
      openRepoRiskCount,
    };
  });
}

/** Cross-repo commit feed for /admin/repositories/commits. */
export async function getRecentCommitsAcrossRepos(opts: {
  take?: number;
  repoId?: string;
  appId?: string;
  riskOnly?: boolean;
} = {}) {
  const take = Math.min(opts.take ?? 100, 500);

  let allowedRepoIds: string[] | null = null;
  if (opts.appId) {
    const links = await prisma.appRepositoryLink.findMany({
      where: { appRegistryId: opts.appId },
      select: { gitRepositoryId: true },
    });
    allowedRepoIds = links.map((l) => l.gitRepositoryId);
  }

  return prisma.gitCommitEvent.findMany({
    where: {
      ...(opts.repoId ? { gitRepositoryId: opts.repoId } : {}),
      ...(allowedRepoIds ? { gitRepositoryId: { in: allowedRepoIds } } : {}),
      ...(opts.riskOnly ? { NOT: { riskFlagsJson: { equals: [] } } } : {}),
    },
    orderBy: { committedAt: "desc" },
    take,
    include: {
      repo: {
        select: {
          fullName: true,
          owner: true,
          repo: true,
          htmlUrl: true,
          appLinks: {
            select: { app: { select: { id: true, appKey: true, name: true } } },
          },
        },
      },
    },
  });
}

/** Recent workflow runs for /admin/repositories/workflow-runs. */
export async function getRecentWorkflowRuns(opts: {
  take?: number;
  repoId?: string;
  failedOnly?: boolean;
} = {}) {
  const take = Math.min(opts.take ?? 100, 500);
  return prisma.gitWorkflowRun.findMany({
    where: {
      ...(opts.repoId ? { gitRepositoryId: opts.repoId } : {}),
      ...(opts.failedOnly
        ? { status: "completed", conclusion: "failure" }
        : {}),
    },
    orderBy: { startedAt: "desc" },
    take,
    include: {
      repo: {
        select: {
          fullName: true,
          appLinks: {
            select: { app: { select: { id: true, appKey: true, name: true } } },
          },
        },
      },
    },
  });
}

/** Snapshot fed to evaluateRepoRisks() for one app, during reconciliation. */
export async function getRepoSnapshotForApp(
  app: AppRegistry,
  liveCommitSha: string | null,
): Promise<RepoSnapshot | null> {
  // Find the primary repo link for this app. Apps without a link have
  // no repo intelligence — caller suppresses the rules.
  const link = await prisma.appRepositoryLink.findFirst({
    where: { appRegistryId: app.id, isPrimary: true },
    include: {
      repo: true,
    },
  });
  if (!link) return null;

  const productionBranch = link.productionBranch ?? link.repo.defaultBranch;

  // Compare the live deployed sha against the GitHub HEAD when we can.
  let commitsBehind: number | null = null;
  if (liveCommitSha && link.repo.latestHeadSha) {
    if (liveCommitSha === link.repo.latestHeadSha) {
      commitsBehind = 0;
    } else {
      const client: GitHubClient = getGitHubClient();
      if (client.configured) {
        const cmp = await client.compareCommits(
          link.repo.owner,
          link.repo.repo,
          liveCommitSha,
          link.repo.latestHeadSha,
        );
        if (cmp.ok) {
          commitsBehind = cmp.data.aheadBy; // base..head : "head is N ahead of base"
        }
      }
    }
  }

  const hoursSinceHeadCommit =
    link.repo.latestHeadCommittedAt
      ? Math.max(0, (Date.now() - link.repo.latestHeadCommittedAt.getTime()) / 3_600_000)
      : null;

  const latestWorkflow = await prisma.gitWorkflowRun.findFirst({
    where: { gitRepositoryId: link.repo.id, branch: productionBranch },
    orderBy: { startedAt: "desc" },
  });

  const latestCommit = await prisma.gitCommitEvent.findFirst({
    where: { gitRepositoryId: link.repo.id, branch: productionBranch },
    orderBy: { committedAt: "desc" },
  });

  return {
    liveCommitSha,
    githubHeadSha: link.repo.latestHeadSha,
    commitsBehind,
    hoursSinceHeadCommit,
    latestWorkflow: latestWorkflow
      ? {
          id: latestWorkflow.id,
          name: latestWorkflow.name,
          status: latestWorkflow.status,
          conclusion: latestWorkflow.conclusion,
          htmlUrl: latestWorkflow.htmlUrl,
          startedAt: latestWorkflow.startedAt,
        }
      : null,
    latestCommitRiskCategories: jsonAsRiskCategories(latestCommit?.riskFlagsJson),
    latestCommitSha: latestCommit?.sha ?? null,
    latestCommitMessage: latestCommit?.message ?? null,
  };
}

function jsonAsRiskCategories(value: unknown): RiskCategory[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is RiskCategory => typeof v === "string") as RiskCategory[];
}
