/**
 * POST /api/command-center/release-notes/generate
 *
 * Body: { appId?: string, gitRepositoryId?: string, summaryType: string,
 *         windowDays?: number }
 *
 * Generates a CommitSummary for the requested scope. Permission:
 * REPOSITORIES_MANAGE. The caller's email is captured on the audit
 * row so re-runs are attributable.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  AuthorizationError,
  requireAuthContext,
} from "@/lib/authz";
import { generateCommitSummary } from "@/lib/services/command-center/commit-summary-service";
import type { CommitSummaryType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED: CommitSummaryType[] = ["daily", "weekly", "release", "deployment", "incident", "manual"];

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuthContext();
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
    }
    const t = body.summaryType;
    if (typeof t !== "string" || !ALLOWED.includes(t as CommitSummaryType)) {
      return NextResponse.json({ ok: false, error: "summary_type_invalid" }, { status: 400 });
    }
    const outcome = await generateCommitSummary(ctx, {
      appRegistryId: typeof body.appId === "string" ? body.appId : undefined,
      gitRepositoryId:
        typeof body.gitRepositoryId === "string" ? body.gitRepositoryId : undefined,
      summaryType: t as CommitSummaryType,
      windowDays: typeof body.windowDays === "number" ? body.windowDays : undefined,
    });
    return NextResponse.json({
      ok: true,
      summaryId: outcome.summary.id,
      commitsConsidered: outcome.commitsConsidered,
      aiAugmented: outcome.aiAugmented,
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
    return NextResponse.json({ ok: false, error: "generation_failed" }, { status: 500 });
  }
}
