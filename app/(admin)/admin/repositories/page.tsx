/**
 * /admin/repositories — list every GitHub repo the Suite tracks,
 * one per row, with the apps it powers, drift state, and the most
 * recent workflow run.
 */

import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import { Button } from "@/components/ui/button";
import { RepoStatusTable } from "@/components/repositories/repo-status-table";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRepositorySnapshots } from "@/lib/services/command-center/repo-intelligence-service";
import { githubSyncConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function RepositoriesPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
  const rows = await getRepositorySnapshots();
  const syncEnabled = githubSyncConfigured();

  const lastSync = rows
    .map((r) => r.repo.lastSyncedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="GitHub Repositories"
        description="Every repository that powers a MacTech app. Drift, latest commit, latest workflow — synced from GitHub on each Command Center reconciliation."
        actions={
          <div className="flex items-center gap-3">
            <LastSyncedStamp at={lastSync} />
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/repositories/commits">Commit feed →</Link>
            </Button>
          </div>
        }
      />

      {!syncEnabled ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-[hsl(38_92%_60%)]">
          GitHub sync is disabled. Set <span className="font-mono">GITHUB_TOKEN</span> + {" "}
          <span className="font-mono">ENABLE_GITHUB_SYNC=true</span> on the Suite Railway service. The
          next reconciliation will populate this page automatically.
        </div>
      ) : null}

      <RepoStatusTable rows={rows} />
    </div>
  );
}
