/**
 * GET /api/command-center/repos
 *
 * List of GitRepository rows enriched with their linked apps + the
 * latest commit / workflow run + open repo-risk count. Drives the
 * /admin/repositories table.
 */

import { NextResponse } from "next/server";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRepositorySnapshots } from "@/lib/services/command-center/repo-intelligence-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
    const snapshots = await getRepositorySnapshots();
    return NextResponse.json({
      ok: true,
      repos: snapshots.map((s) => ({
        id: s.repo.id,
        fullName: s.repo.fullName,
        owner: s.repo.owner,
        repo: s.repo.repo,
        defaultBranch: s.repo.defaultBranch,
        htmlUrl: s.repo.htmlUrl,
        active: s.repo.active,
        latestHeadSha: s.repo.latestHeadSha,
        latestHeadShortSha: s.repo.latestHeadShortSha,
        latestHeadCommittedAt: s.repo.latestHeadCommittedAt,
        lastSyncedAt: s.repo.lastSyncedAt,
        lastSyncError: s.repo.lastSyncError,
        recentCommitCount: s.repo.recentCommitCount,
        recentWorkflowCount: s.repo.recentWorkflowCount,
        apps: s.apps,
        latestCommit: s.latestCommit
          ? {
              sha: s.latestCommit.sha,
              shortSha: s.latestCommit.shortSha,
              message: s.latestCommit.message.split("\n")[0],
              authorEmail: s.latestCommit.authorEmail,
              committedAt: s.latestCommit.committedAt,
              htmlUrl: s.latestCommit.htmlUrl,
            }
          : null,
        latestWorkflow: s.latestWorkflow
          ? {
              id: s.latestWorkflow.id,
              name: s.latestWorkflow.name,
              status: s.latestWorkflow.status,
              conclusion: s.latestWorkflow.conclusion,
              htmlUrl: s.latestWorkflow.htmlUrl,
              startedAt: s.latestWorkflow.startedAt,
            }
          : null,
        openRepoRiskCount: s.openRepoRiskCount,
      })),
    });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const status =
        err.code === "unauthenticated"
          ? 401
          : err.code === "permission_denied" || err.code === "no_platform_access"
            ? 403
            : 400;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 500 });
  }
}
