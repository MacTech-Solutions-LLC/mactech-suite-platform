/**
 * /admin/ops/deployments — Railway deployment table for every tracked
 * (project, service, environment) tuple. Live status from the most
 * recent DeploymentSnapshot row, plus last-successful timestamp for
 * stale-deployment triage.
 */

import { PageHeader } from "@/components/layout/admin-shell";
import { DeploymentTable } from "@/components/deployments/deployment-table";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getDeploymentSnapshots } from "@/lib/services/command-center/deployment-intelligence-service";
import { railwaySyncConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function DeploymentsPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW);
  const rows = await getDeploymentSnapshots();
  const enabled = railwaySyncConfigured();

  const lastSync = rows
    .map((r) => r.resource.lastSyncedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Railway Deployments"
        description="One row per tracked (project, service, environment). Live status, deployed commit, last-successful timestamp, drift indicator. Updated by the periodic reconciliation and Railway webhook deliveries."
        actions={<LastSyncedStamp at={lastSync} />}
      />

      {!enabled ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-[hsl(38_92%_60%)]">
          Railway sync is disabled. Set <span className="font-mono">RAILWAY_API_TOKEN</span> + {" "}
          <span className="font-mono">ENABLE_RAILWAY_SYNC=true</span> on the Suite Railway service.
          The next reconciliation will populate this page automatically.
        </div>
      ) : null}

      <DeploymentTable rows={rows} />
    </div>
  );
}
