/**
 * POST /api/feedback/dispatch
 *
 * The "Send to Claude" action from /admin/feedback. Instead of paying for an
 * agent loop, this files a `@claude <feedback>` GitHub issue in the repo the
 * feedback is about — the Claude Code GitHub App reads it and opens a PR. No
 * Anthropic API billing from the Suite; the opened PR (human-reviewed on
 * GitHub) is the gate.
 *
 * Body: { feedbackIds?: string[] }   // omitted/empty → all open items
 *                                     //   (status new | acknowledged)
 *
 * Flow:
 *   1. Authorize: platform:feedback:manage + platform:repositories:manage.
 *   2. Load the target open feedback rows.
 *   3. Group them by target repo (pageUrl → AppRegistry → repo, Suite default).
 *   4. File one @claude routine per repo via fileClaudeRoutineIssue().
 *   5. Record the issue link on every dispatched item and flip it to
 *      `dispatched`.
 *
 * Response: 200 { ok: true, dispatchedCount, issues: [{repoFullName,
 *   issueNumber, issueUrl, count}], failures: [{repoFullName, reason, count}] }
 * If every repo group failed, returns 502 with ok:false.
 */

import { type NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { fileClaudeRoutineIssue } from "@/lib/agents/cross-repo/claude-routine";
import {
  buildFeedbackAgentRequest,
  buildFeedbackContextHint,
  groupFeedbackByRepo,
} from "@/lib/services/feedback-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Statuses eligible to be sent into a @claude routine. */
const OPEN_STATUSES = ["new", "acknowledged"] as const;

export async function POST(request: NextRequest) {
  try {
    // Dispatch files a GitHub issue that opens a PR, so it needs both the
    // feedback-manage right and the repositories-manage right.
    const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.FEEDBACK_MANAGE);
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE);

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // An empty body is valid — "dispatch all open items".
    }

    const idFilter = Array.isArray(body.feedbackIds)
      ? body.feedbackIds.filter((x): x is string => typeof x === "string")
      : null;

    const items = await prisma.feedback.findMany({
      where: {
        status: { in: [...OPEN_STATUSES] },
        ...(idFilter && idFilter.length > 0 ? { id: { in: idFilter } } : {}),
      },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    });

    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: "no_open_feedback" }, { status: 400 });
    }

    // Map each item to the repo it's about, then file one routine per repo.
    const appRows = await prisma.appRegistry.findMany({
      where: { repoFullName: { not: null } },
      select: { subdomain: true, apexDomain: true, publicUrl: true, repoFullName: true },
    });
    const groups = groupFeedbackByRepo(items, appRows);

    const issues: Array<{
      repoFullName: string;
      issueNumber: number;
      issueUrl: string;
      count: number;
    }> = [];
    const failures: Array<{ repoFullName: string; reason: string; count: number }> = [];
    const now = new Date();

    for (const [repoFullName, groupItems] of Array.from(groups)) {
      const result = await fileClaudeRoutineIssue({
        repoFullName,
        intent: buildFeedbackAgentRequest(groupItems),
        contextHint: buildFeedbackContextHint(groupItems),
      });

      if (!result.ok) {
        failures.push({ repoFullName, reason: result.reason, count: groupItems.length });
        continue;
      }

      await prisma.feedback.updateMany({
        where: { id: { in: groupItems.map((i) => i.id) } },
        data: {
          status: "dispatched",
          githubRepo: result.repoFullName,
          githubIssueNumber: result.issueNumber,
          githubIssueUrl: result.issueUrl,
          dispatchedAt: now,
          dispatchedByEmail: ctx.userProfile.email,
        },
      });
      issues.push({
        repoFullName: result.repoFullName,
        issueNumber: result.issueNumber,
        issueUrl: result.issueUrl,
        count: groupItems.length,
      });
    }

    const dispatchedCount = issues.reduce((n, i) => n + i.count, 0);

    // Nothing landed — surface the first failure reason so the UI can explain.
    if (dispatchedCount === 0) {
      return NextResponse.json(
        { ok: false, error: failures[0]?.reason ?? "dispatch_failed", failures },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, dispatchedCount, issues, failures });
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
    console.error("[api/feedback/dispatch]", err);
    return NextResponse.json({ ok: false, error: "dispatch_failed" }, { status: 500 });
  }
}
