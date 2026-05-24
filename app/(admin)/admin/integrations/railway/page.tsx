/**
 * /admin/integrations/railway — Railway integration status. Surfaces
 * whether the API token is configured, lists discovered resources,
 * and points operators at the dashboard for webhook configuration.
 * No tokens are ever displayed.
 */

import Link from "next/link";
import { CheckCircle2, AlertTriangle, Rocket, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { railwaySyncConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function RailwayIntegrationPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.INTEGRATIONS_VIEW);
  const enabled = railwaySyncConfigured();
  const resources = await prisma.railwayResource.findMany({
    orderBy: [{ projectName: "asc" }, { serviceName: "asc" }],
    include: { app: { select: { appKey: true } } },
  });
  const lastSynced = resources
    .map((r) => r.lastSyncedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Railway"
        description="Token configured status, discovered services, and webhook setup pointer. Tokens never displayed."
        actions={<LastSyncedStamp at={lastSynced} />}
      />

      <ConfiguredCard enabled={enabled} />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Discovered resources ({resources.length})
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
          {resources.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              {enabled
                ? "Sync hasn't completed yet. Click Sync now on /command-center."
                : "Railway sync disabled — set RAILWAY_API_TOKEN + ENABLE_RAILWAY_SYNC=true."}
            </li>
          ) : null}
          {resources.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
              <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
              <Link
                href={r.railwayDashboardUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {r.serviceName ?? r.serviceId}
                <ExternalLink className="ml-1 inline h-3 w-3" />
              </Link>
              <span className="font-mono text-[11px] text-muted-foreground">
                {r.projectName ?? r.projectId} · {r.environmentName ?? r.environmentId}
              </span>
              <span className="ml-auto rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {r.app?.appKey ?? "unmapped"}
              </span>
              {r.lastSyncError ? (
                <span className="font-mono text-[10px] text-destructive">{r.lastSyncError}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border border-border bg-card/40 p-4 text-xs text-muted-foreground">
        <div className="text-sm font-medium text-foreground">Webhook setup</div>
        <p className="mt-2">
          Railway&apos;s public GraphQL API does not expose webhook CRUD. Add the webhook in each
          project&apos;s Settings → Webhooks tab manually, pointing at
          <span className="ml-1 font-mono">/api/webhooks/railway?secret=&lt;RAILWAY_WEBHOOK_SECRET&gt;</span>.
          Until configured, the periodic reconciliation still picks up deployment state via the API
          on every cycle.
        </p>
      </section>
    </div>
  );
}

function ConfiguredCard({ enabled }: { enabled: boolean }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
        enabled ? "border-success/30 bg-success/10" : "border-warning/40 bg-warning/10"
      }`}
    >
      {enabled ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      )}
      <div>
        <div className={enabled ? "text-success" : "text-warning"}>
          {enabled ? "Token configured" : "Token not configured"}
        </div>
        <p className="mt-0.5 text-muted-foreground">
          {enabled
            ? "RAILWAY_API_TOKEN is set and ENABLE_RAILWAY_SYNC=true. Reconciliation includes the Railway leg."
            : "Set RAILWAY_API_TOKEN and ENABLE_RAILWAY_SYNC=true on the Suite Railway service. Account-scoped tokens (https://railway.app/account/tokens) are required."}
        </p>
      </div>
    </div>
  );
}
