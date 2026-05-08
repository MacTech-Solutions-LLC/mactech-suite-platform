/**
 * GET /api/command-center/repos/[id]/commits
 *
 * Recent commits for one repo, severity-categorized. Drives the
 * /admin/repositories/[id]/commits view (repo-scoped) and is also
 * the underlying API for the future `summarize_repo_activity`
 * AgentOps capability.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRecentCommitsAcrossRepos } from "@/lib/services/command-center/repo-intelligence-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
    const url = request.nextUrl;
    const take = Number(url.searchParams.get("take") ?? "100");
    const riskOnly = url.searchParams.get("riskOnly") === "true";

    const commits = await getRecentCommitsAcrossRepos({
      repoId: params.id,
      take,
      riskOnly,
    });

    return NextResponse.json({
      ok: true,
      commits: commits.map((c) => ({
        id: c.id,
        sha: c.sha,
        shortSha: c.shortSha,
        branch: c.branch,
        message: c.message.split("\n")[0],
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        authorLogin: c.authorLogin,
        committedAt: c.committedAt,
        htmlUrl: c.htmlUrl,
        filesChanged: c.filesChanged,
        additions: c.additions,
        deletions: c.deletions,
        riskFlags: c.riskFlagsJson ?? [],
        repoFullName: c.repo.fullName,
        apps: c.repo.appLinks.map((l) => l.app),
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
