/**
 * /admin/repositories/workflow-runs — recent workflow runs across repos.
 */

import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { WorkflowRunTable } from "@/components/repositories/workflow-run-table";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRecentWorkflowRuns } from "@/lib/services/command-center/repo-intelligence-service";

export const dynamic = "force-dynamic";

interface SearchParams {
  failedOnly?: string;
}

export default async function WorkflowRunsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
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
      <WorkflowRunTable runs={runs} />
    </div>
  );
}
