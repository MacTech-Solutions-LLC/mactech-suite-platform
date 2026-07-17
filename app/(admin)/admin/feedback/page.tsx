/**
 * /admin/feedback — the UI-Fix feedback review queue.
 *
 * Teammates file element-pinpointed feedback from the UI-Fix Chrome
 * extension; it lands via POST /api/public/feedback. Here an internal admin
 * triages the queue and can bundle open items into a single Claude agent
 * run ("kick off a session") that reads every note and corrects each
 * reported UI/UX issue. The resulting run is linked back on each item.
 */

import { PageHeader } from "@/components/layout/admin-shell";
import { requirePlatformPermission, hasPlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { FeedbackConsole, type FeedbackRow } from "./_components/feedback-console";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.FEEDBACK_VIEW);
  const canManage = hasPlatformPermission(ctx, PLATFORM_PERMISSIONS.FEEDBACK_MANAGE);

  const items = await prisma.feedback.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 500,
    include: {
      agentRun: { select: { id: true, status: true, planSummary: true } },
    },
  });

  const rows: FeedbackRow[] = items.map((f) => ({
    id: f.id,
    category: f.category,
    status: f.status,
    content: f.content,
    pageUrl: f.pageUrl,
    elementSelector: f.elementSelector,
    elementId: f.elementId,
    elementClass: f.elementClass,
    elementText: f.elementText,
    elementType: f.elementType,
    submittedBy: f.submittedBy,
    adminNotes: f.adminNotes,
    createdAt: f.createdAt.toISOString(),
    dispatchedAt: f.dispatchedAt?.toISOString() ?? null,
    dispatchedByEmail: f.dispatchedByEmail,
    agentRunId: f.agentRunId,
    agentRunStatus: f.agentRun?.status ?? null,
  }));

  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Feedback"
        description="Element-pinpointed feedback filed from the UI-Fix browser extension. Triage the queue, then bundle open items into a Claude agent run that reads every note and corrects each reported UI/UX issue."
      />
      <FeedbackConsole rows={rows} canManage={canManage} newCount={newCount} />
    </div>
  );
}
