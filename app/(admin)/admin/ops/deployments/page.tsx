/**
 * /admin/ops/deployments — Railway deployments dashboard (Slice 12).
 *
 * Three sections: at-a-glance tiles (live/broken/drift/stale/24h
 * success-rate), per-resource current-state table, and a cross-app
 * recent-deploys timeline. AskAIPanel below grounds answers on the
 * deployment_drift context so operators can ask "what's behind on
 * production right now?" or "draft a Slack post about today's deploys".
 */

import { PageHeader } from "@/components/layout/admin-shell";
import { DeploymentTable } from "@/components/deployments/deployment-table";
import { DeploymentOverviewTiles } from "@/components/deployments/deployment-overview-tiles";
import { RecentDeployments } from "@/components/deployments/recent-deployments";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import { AskAIPanel } from "@/components/ai/ask-ai-panel";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  getDeploymentSnapshots,
  getDeploymentsOverview,
  getRecentDeployments,
} from "@/lib/services/command-center/deployment-intelligence-service";
import { railwaySyncConfigured } from "@/lib/env";
import { emailReady } from "@/lib/services/command-center/ai-ask-service";

export const dynamic = "force-dynamic";

export default async function DeploymentsPage() {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW,
  );
  const canEmail = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE);

  const [rows, overview, recent] = await Promise.all([
    getDeploymentSnapshots(),
    getDeploymentsOverview(),
    getRecentDeployments(30),
  ]);
  const enabled = railwaySyncConfigured();

  const lastSync = rows
    .map((r) => r.resource.lastSyncedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Railway Deployments"
        description="Per-resource live status, deployed commit, drift indicator, and stale-deployment triage. Updated by periodic reconciliation and Railway webhook deliveries."
        actions={<LastSyncedStamp at={lastSync} />}
      />

      {!enabled ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-[hsl(38_92%_60%)]">
          Railway sync is disabled. Set <span className="font-mono">RAILWAY_API_TOKEN</span> +{" "}
          <span className="font-mono">ENABLE_RAILWAY_SYNC=true</span> on the Suite Railway service.
          The next reconciliation will populate this page automatically.
        </div>
      ) : null}

      <section>
        <DeploymentOverviewTiles overview={overview} />
      </section>

      <section>
        <AskAIPanel
          contextKey="deployment_drift"
          label="Deployments"
          canEmail={canEmail}
          emailConfigured={emailReady()}
          presets={[
            "Which apps are behind production HEAD and by how much? Order by criticality.",
            "Have any deploys failed or crashed in the last 24h? If so, summarize the pattern.",
            "Draft a one-paragraph status email to leadership covering today's deployments.",
            "Are there any apps that haven't deployed in over a week? List them and flag the highest-criticality ones first.",
          ]}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Tracked services
            </h2>
            <span className="text-xs text-muted-foreground">
              {rows.length} resource{rows.length === 1 ? "" : "s"} · sorted by project
            </span>
          </div>
          <DeploymentTable rows={rows} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Recent deploys
            </h2>
            <span className="text-xs text-muted-foreground">
              last {recent.length} across the ecosystem
            </span>
          </div>
          <RecentDeployments rows={recent} />
        </div>
      </section>
    </div>
  );
}
