/**
 * GET /api/command-center/repos/[id]/workflow-runs
 *
 * Recent workflow runs for one repo, with `?failedOnly=true` to filter.
 * Drives /admin/repositories/[id]/workflow-runs.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRecentWorkflowRuns } from "@/lib/services/command-center/repo-intelligence-service";

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
    const failedOnly = url.searchParams.get("failedOnly") === "true";
    const runs = await getRecentWorkflowRuns({
      repoId: params.id,
      take,
      failedOnly,
    });
    return NextResponse.json({
      ok: true,
      runs: runs.map((r) => ({
        id: r.id,
        githubRunId: r.githubRunId.toString(),
        name: r.name,
        event: r.event,
        branch: r.branch,
        headSha: r.headSha,
        status: r.status,
        conclusion: r.conclusion,
        htmlUrl: r.htmlUrl,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        durationMs: r.durationMs,
        repoFullName: r.repo.fullName,
        apps: r.repo.appLinks.map((l) => l.app),
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
