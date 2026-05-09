/**
 * /admin/repositories/workflow-runs — recent workflow runs across repos.
 */

import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { WorkflowRunTable } from "@/components/repositories/workflow-run-table";
import { AskAIPanel } from "@/components/ai/ask-ai-panel";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRecentWorkflowRuns } from "@/lib/services/command-center/repo-intelligence-service";
import { emailReady } from "@/lib/services/command-center/ai-ask-service";

export const dynamic = "force-dynamic";

interface SearchParams {
  failedOnly?: string;
}

export default async function WorkflowRunsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.REPOSITORIES_VIEW,
  );
  const canEmail = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  const failedOnly = searchParams?.failedOnly === "true";
  const runs = await getRecentWorkflowRuns({ take: 100, failedOnly });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow runs"
        description="GitHub Actions runs across every repo. Failed runs on the default branch open a failed_workflow risk flag on the corresponding app."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={failedOnly ? "default" : "outline"}
              asChild
            >
              <Link
                href={
                  failedOnly
                    ? "/admin/repositories/workflow-runs"
                    : "/admin/repositories/workflow-runs?failedOnly=true"
                }
              >
                {failedOnly ? "All runs" : "Failures only"}
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/repositories">← Repos</Link>
            </Button>
          </div>
        }
      />
      <AskAIPanel
        contextKey="workflow_failures"
        canEmail={canEmail}
        emailConfigured={emailReady()}
        presets={[
          "Group the recent failures by repo and explain which one needs investigation first.",
          "Across the last 24h, what's the failure-rate pattern? Are there clusters in time, repo, or workflow name?",
          "Draft a brief Slack-style summary of today's failed CI runs for the engineering channel.",
          "Are any of these failures correlated with a specific commit or PR? If so, which?",
        ]}
      />
      <WorkflowRunTable runs={runs} failedOnly={failedOnly} />
    </div>
  );
}
