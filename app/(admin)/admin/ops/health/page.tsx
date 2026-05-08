/**
 * /admin/ops/health — per-app health time series. Complements the
 * Slice 1 overview tile with N-probe history + latency at a glance.
 */

import { PageHeader } from "@/components/layout/admin-shell";
import { HealthHistoryGrid } from "@/components/deployments/health-history-grid";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRecentHealthCheckHistory } from "@/lib/services/command-center/deployment-intelligence-service";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
  const history = await getRecentHealthCheckHistory(24);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health Checks"
        description="Per-app health time series. Each square is one probe — newest on the right. Hover for status code + latency + timestamp."
      />
      <HealthHistoryGrid
        rows={history.map((r) => ({
          appKey: r.app.appKey,
          name: r.app.name,
          criticality: r.app.criticality,
          healthUrl: r.app.healthUrl,
          snapshots: r.snapshots,
        }))}
      />
    </div>
  );
}
