/**
 * /command-center — the flagship operational surface of MacTech Suite.
 *
 * Read-gated by COMMAND_CENTER_VIEW (mactech_admin / support / auditor /
 * read-only); the Sync now button is hidden for users without the
 * COMMAND_CENTER_MANAGE permission.
 */

import { Compass } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import { OverviewTiles } from "@/components/command-center/overview-tiles";
import { AppStatusTable } from "@/components/command-center/app-status-table";
import { RiskFeed } from "@/components/command-center/risk-feed";
import { SyncNowButton } from "@/components/command-center/sync-now-button";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  getAppOperationalSnapshots,
  getCommandCenterStatus,
  getOpenRiskFlags,
} from "@/lib/services/command-center/command-center-service";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.COMMAND_CENTER_VIEW,
  );
  const canManage = ctx.permissions.includes(
    PLATFORM_PERMISSIONS.COMMAND_CENTER_MANAGE,
  );

  const [status, snapshots, risks] = await Promise.all([
    getCommandCenterStatus(),
    getAppOperationalSnapshots(),
    getOpenRiskFlags(20),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Command Center"
        description="Single internal control plane for the MacTech ecosystem — identity, app registry, runtime health, deployment drift, repository intelligence, operational risk."
        actions={
          <div className="flex items-center gap-3">
            <LastSyncedStamp at={status.lastReconciliationAt} />
            {canManage ? <SyncNowButton /> : null}
          </div>
        }
      />

      <section>
        <OverviewTiles status={status} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              MacTech apps
            </h2>
            <span className="text-xs text-muted-foreground">
              {status.totalApps} active · sorted by criticality
            </span>
          </div>
          <AppStatusTable snapshots={snapshots} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Open risks
            </h2>
            <span className="text-xs text-muted-foreground">
              {status.openRiskCount} · {status.criticalRiskCount} high/critical
            </span>
          </div>
          <RiskFeed risks={risks} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card/40 p-4 text-xs text-muted-foreground md:p-5">
        <div className="flex items-center gap-2 text-foreground">
          <Compass className="h-3.5 w-3.5" />
          <span className="text-sm font-medium">About the Command Center</span>
        </div>
        <p className="mt-2 max-w-3xl">
          Command Center is the flagship capability of MacTech Suite. It correlates the App
          Registry, runtime health, operational risk, and audit trail into a single executive-readable
          surface. Slice 1 (this release) covers the App Registry + health probing + risk evaluation.
          Repository intelligence (commit feed, drift detection, workflow runs) and deployment
          intelligence (Railway state, build-info correlation) ship in subsequent slices.
        </p>
      </section>
    </div>
  );
}
