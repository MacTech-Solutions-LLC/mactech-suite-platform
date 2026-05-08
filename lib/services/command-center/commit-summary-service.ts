/**
 * CommitSummary generation + read.
 *
 * Two paths produce a CommitSummary row:
 *   1. Deterministic generator — pure function over recent
 *      GitCommitEvent rows. Always works, no external dependencies.
 *   2. AI-augmented — same input, narrative output via OpenAI.
 *      Gated on ENABLE_AI_SUMMARIES + OPENAI_API_KEY. Falls back to
 *      the deterministic path on any failure.
 *
 * AgentOps discipline:
 *   - Permission re-checked inside the public mutating entry point
 *     (REPOSITORIES_MANAGE).
 *   - Idempotency: re-running a summary with the same (app, type,
 *     rangeHeadSha) updates the existing row rather than dupe-creating.
 *   - Audit row written for every generation so the future
 *     `generate_release_notes` capability has a clean lineage.
 *   - The OpenAI key never reaches this file; we call the AI client
 *     wrapper which lives in lib/integrations/ai/summary-client.ts.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  AuthorizationError,
  type CommandCenterAuthContext,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  aiSummariesConfigured,
  generateAiSummary,
} from "@/lib/integrations/ai/summary-client";
import type { AppRegistry, CommitSummary, CommitSummaryType, GitCommitEvent, Prisma } from "@prisma/client";

export interface GenerateSummaryInput {
  appRegistryId?: string;
  gitRepositoryId?: string;
  /** "daily" | "weekly" | … */
  summaryType: CommitSummaryType;
  /** Time window to consider when picking commits. Default 7 days. */
  windowDays?: number;
}

export interface GenerateSummaryOutcome {
  summary: CommitSummary;
  commitsConsidered: number;
  aiAugmented: boolean;
}

/** Public entrypoint — caller must hold REPOSITORIES_MANAGE. */
export async function generateCommitSummary(
  ctx: CommandCenterAuthContext,
  input: GenerateSummaryInput,
): Promise<GenerateSummaryOutcome> {
  if (!ctx.permissions.includes(PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE)) {
    throw new AuthorizationError(
      "REPOSITORIES_MANAGE required to generate a commit summary.",
      "permission_denied",
    );
  }
  return generateCommitSummaryInternal(input, { triggeredByEmail: ctx.userProfile.email });
}

export async function generateCommitSummaryInternal(
  input: GenerateSummaryInput,
  opts: { triggeredByEmail?: string | null } = {},
): Promise<GenerateSummaryOutcome> {
  const windowDays = input.windowDays ?? 7;
  const since = new Date(Date.now() - windowDays * 86_400_000);

  // Resolve the AppRegistry row + linked repos (so cross-app
  // summaries pull from the right repo set).
  let app: AppRegistry | null = null;
  let repoIds: string[] = [];
  if (input.appRegistryId) {
    app = await prisma.appRegistry.findUnique({ where: { id: input.appRegistryId } });
    if (app) {
      const links = await prisma.appRepositoryLink.findMany({
        where: { appRegistryId: app.id },
        select: { gitRepositoryId: true },
      });
      repoIds = links.map((l) => l.gitRepositoryId);
    }
  } else if (input.gitRepositoryId) {
    repoIds = [input.gitRepositoryId];
  } else {
    // Cross-repo "daily ecosystem" summary — pull every repo's
    // recent commits.
    const repos = await prisma.gitRepository.findMany({
      where: { active: true },
      select: { id: true },
    });
    repoIds = repos.map((r) => r.id);
  }

  const commits = repoIds.length
    ? await prisma.gitCommitEvent.findMany({
        where: {
          gitRepositoryId: { in: repoIds },
          committedAt: { gte: since },
        },
        orderBy: { committedAt: "desc" },
        include: {
          repo: {
            select: {
              fullName: true,
              appLinks: { select: { app: { select: { id: true, appKey: true, name: true } } } },
            },
          },
        },
        take: 200,
      })
    : [];

  const appsTouched = collectAppsTouched(commits);
  const sensitive = collectSensitiveCommits(commits);

  // Try AI first if configured. Falls back to deterministic.
  let executiveSummary: string;
  let technicalSummary: string;
  let complianceImpact: string | null;
  let riskSummary: string | null;
  let aiAugmented = false;

  if (aiSummariesConfigured()) {
    const ai = await generateAiSummary({
      summaryType: input.summaryType,
      apps: appsTouched.map((a) => ({ appKey: a.appKey, name: a.name })),
      commitLines: commits.map(
        (c) =>
          `${c.shortSha} ${c.repo.fullName}: ${c.message.split("\n")[0]} (${
            c.authorEmail ?? "unknown"
          })`,
      ),
      sensitiveCommits: sensitive.map((c) => ({
        shortSha: c.shortSha,
        message: c.message.split("\n")[0],
        categories: jsonAsStringArray(c.riskFlagsJson).filter(
          (f) => f !== "security_sensitive_change",
        ),
      })),
    });
    if (ai) {
      executiveSummary = ai.executiveSummary;
      technicalSummary = ai.technicalSummary;
      complianceImpact = ai.complianceImpact;
      riskSummary = ai.riskSummary;
      aiAugmented = true;
    } else {
      const det = deterministicSummary(input.summaryType, commits, appsTouched, sensitive);
      executiveSummary = det.executiveSummary;
      technicalSummary = det.technicalSummary;
      complianceImpact = det.complianceImpact;
      riskSummary = det.riskSummary;
    }
  } else {
    const det = deterministicSummary(input.summaryType, commits, appsTouched, sensitive);
    executiveSummary = det.executiveSummary;
    technicalSummary = det.technicalSummary;
    complianceImpact = det.complianceImpact;
    riskSummary = det.riskSummary;
  }

  // Idempotency key: (appRegistryId, summaryType, rangeHeadSha). When
  // a re-run produces the same triple we update the existing row.
  const headSha = commits[0]?.sha ?? null;
  const baseSha = commits[commits.length - 1]?.sha ?? null;

  const existing = headSha
    ? await prisma.commitSummary.findFirst({
        where: {
          appRegistryId: app?.id ?? null,
          summaryType: input.summaryType,
          rangeHeadSha: headSha,
        },
      })
    : null;

  const summary = existing
    ? await prisma.commitSummary.update({
        where: { id: existing.id },
        data: {
          executiveSummary,
          technicalSummary,
          complianceImpact,
          riskSummary,
          rangeBaseSha: baseSha,
          affectedAppsJson: appsTouched.map((a) => a.appKey) as Prisma.InputJsonValue,
          securitySensitiveChangesJson: sensitive.map((c) => c.id) as Prisma.InputJsonValue,
          aiAugmented,
        },
      })
    : await prisma.commitSummary.create({
        data: {
          appRegistryId: app?.id ?? null,
          gitRepositoryId: input.gitRepositoryId ?? null,
          summaryType: input.summaryType,
          rangeBaseSha: baseSha,
          rangeHeadSha: headSha,
          executiveSummary,
          technicalSummary,
          complianceImpact,
          riskSummary,
          affectedAppsJson: appsTouched.map((a) => a.appKey) as Prisma.InputJsonValue,
          securitySensitiveChangesJson: sensitive.map((c) => c.id) as Prisma.InputJsonValue,
          aiAugmented,
        },
      });

  await writeAuditLog({
    eventType: "command_center.commit_summary.generated",
    eventCategory: "system",
    severity: "info",
    action: `Generated ${input.summaryType} commit summary for ${
      app?.appKey ?? "ecosystem"
    } (${commits.length} commits, ${aiAugmented ? "AI-augmented" : "deterministic"})`,
    actorEmail: opts.triggeredByEmail ?? null,
    appRegistryId: app?.id ?? null,
    resourceType: "commit_summary",
    resourceId: summary.id,
    metadata: {
      summary_type: input.summaryType,
      window_days: windowDays,
      commits_considered: commits.length,
      apps_touched: appsTouched.map((a) => a.appKey),
      ai_augmented: aiAugmented,
    },
  });

  return {
    summary,
    commitsConsidered: commits.length,
    aiAugmented,
  };
}

// ─── Read side ─────────────────────────────────────────────────────────

export async function getRecentCommitSummaries(filter: {
  summaryType?: CommitSummaryType;
  appRegistryId?: string;
  take?: number;
}) {
  return prisma.commitSummary.findMany({
    where: {
      ...(filter.summaryType ? { summaryType: filter.summaryType } : {}),
      ...(filter.appRegistryId ? { appRegistryId: filter.appRegistryId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.take ?? 20, 100),
    include: {
      app: { select: { id: true, appKey: true, name: true } },
    },
  });
}

// ─── Deterministic generator ───────────────────────────────────────────

type CommitWithRepo = GitCommitEvent & {
  repo: {
    fullName: string;
    appLinks: Array<{ app: { id: string; appKey: string; name: string } }>;
  };
};

function deterministicSummary(
  summaryType: string,
  commits: CommitWithRepo[],
  apps: Array<{ id: string; appKey: string; name: string }>,
  sensitive: CommitWithRepo[],
): {
  executiveSummary: string;
  technicalSummary: string;
  complianceImpact: string | null;
  riskSummary: string | null;
} {
  if (commits.length === 0) {
    return {
      executiveSummary: `No new commits across the tracked MacTech repositories during this ${summaryType} window.`,
      technicalSummary: "(no commits)",
      complianceImpact: null,
      riskSummary: null,
    };
  }

  const byApp = new Map<string, CommitWithRepo[]>();
  for (const c of commits) {
    const keys = c.repo.appLinks.map((l) => l.app.appKey);
    const list = keys.length ? keys : ["(unmapped)"];
    for (const k of list) {
      const arr = byApp.get(k) ?? [];
      arr.push(c);
      byApp.set(k, arr);
    }
  }

  const authors = new Set<string>();
  for (const c of commits) if (c.authorEmail) authors.add(c.authorEmail);

  const exec = `${commits.length} commit${commits.length === 1 ? "" : "s"} across ${apps.length} MacTech app${apps.length === 1 ? "" : "s"} during this ${summaryType} window. ${
    sensitive.length > 0
      ? `${sensitive.length} touched security-sensitive paths and warrant a review.`
      : `Nothing in the security-sensitive change set.`
  }${authors.size > 0 ? ` Contributors: ${Array.from(authors).slice(0, 6).join(", ")}.` : ""}`;

  const techLines: string[] = [];
  for (const [appKey, cs] of Array.from(byApp.entries())) {
    techLines.push(`${appKey} (${cs.length}):`);
    for (const c of cs.slice(0, 8)) {
      techLines.push(
        `  - ${c.shortSha} ${c.message.split("\n")[0].slice(0, 120)} (${c.authorEmail ?? "unknown"})`,
      );
    }
    if (cs.length > 8) techLines.push(`  - … +${cs.length - 8} more`);
  }
  const technical = techLines.join("\n");

  const compliance = sensitive.length
    ? `Compliance review recommended. ${sensitive.length} commit${sensitive.length === 1 ? "" : "s"} touched paths in the security-sensitive set: ${sensitive
        .slice(0, 6)
        .map((c) => c.shortSha)
        .join(", ")}.`
    : null;

  const risk = sensitive.length
    ? `Review the sensitive commits before the next release. Categories observed: ${categoriesFor(sensitive).join(", ")}.`
    : null;

  return {
    executiveSummary: exec,
    technicalSummary: technical,
    complianceImpact: compliance,
    riskSummary: risk,
  };
}

function collectAppsTouched(
  commits: CommitWithRepo[],
): Array<{ id: string; appKey: string; name: string }> {
  const seen = new Map<string, { id: string; appKey: string; name: string }>();
  for (const c of commits) {
    for (const link of c.repo.appLinks) {
      seen.set(link.app.id, link.app);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.appKey.localeCompare(b.appKey));
}

function collectSensitiveCommits(commits: CommitWithRepo[]): CommitWithRepo[] {
  return commits.filter((c) =>
    jsonAsStringArray(c.riskFlagsJson).includes("security_sensitive_change"),
  );
}

function categoriesFor(commits: CommitWithRepo[]): string[] {
  const set = new Set<string>();
  for (const c of commits) {
    for (const f of jsonAsStringArray(c.riskFlagsJson)) {
      if (f !== "security_sensitive_change") set.add(f);
    }
  }
  return Array.from(set);
}

function jsonAsStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
