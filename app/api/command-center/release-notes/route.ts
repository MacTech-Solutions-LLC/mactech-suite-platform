/**
 * GET /api/command-center/release-notes
 *
 * Lists recent CommitSummary rows. Filter by `?type=` (daily | weekly |
 * release | …) and `?appId=`. Drives the /admin/repositories/release-notes
 * page.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  AuthorizationError,
  requirePlatformPermission,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRecentCommitSummaries } from "@/lib/services/command-center/commit-summary-service";
import type { CommitSummaryType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYPES: CommitSummaryType[] = ["daily", "weekly", "release", "deployment", "incident", "manual"];

export async function GET(request: NextRequest) {
  try {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
    const u = request.nextUrl;
    const t = u.searchParams.get("type");
    const summaryType = t && TYPES.includes(t as CommitSummaryType) ? (t as CommitSummaryType) : undefined;
    const summaries = await getRecentCommitSummaries({
      summaryType,
      appRegistryId: u.searchParams.get("appId") ?? undefined,
      take: Number(u.searchParams.get("take") ?? "30"),
    });
    return NextResponse.json({
      ok: true,
      summaries: summaries.map((s) => ({
        id: s.id,
        summaryType: s.summaryType,
        executiveSummary: s.executiveSummary,
        technicalSummary: s.technicalSummary,
        complianceImpact: s.complianceImpact,
        riskSummary: s.riskSummary,
        affectedApps: s.affectedAppsJson,
        rangeBaseSha: s.rangeBaseSha,
        rangeHeadSha: s.rangeHeadSha,
        aiAugmented: s.aiAugmented,
        createdAt: s.createdAt,
        app: s.app,
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
