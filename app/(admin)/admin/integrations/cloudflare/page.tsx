/**
 * /admin/integrations/cloudflare — minimal status page. Slice 4 ships
 * the surface; Cloudflare API integration itself is a future
 * follow-up (wire CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, then
 * a sync against zones / hostnames / SSL state).
 */

import { AlertTriangle, Cloud } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function CloudflareIntegrationPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.INTEGRATIONS_VIEW);
  const tokenConfigured = Boolean(env.CLOUDFLARE_API_TOKEN);
  const accountConfigured = Boolean(env.CLOUDFLARE_ACCOUNT_ID);

  // Today's only Cloudflare-aware data is whatever's in
  // AppRegistry.cloudflareHostname / cloudflareZoneId.
  const apps = await prisma.appRegistry.findMany({
    where: { status: "active" },
    orderBy: [{ subdomain: "asc" }],
    select: {
      appKey: true,
      name: true,
      cloudflareHostname: true,
      cloudflareZoneId: true,
    },
  });
  const mapped = apps.filter((a) => a.cloudflareHostname || a.cloudflareZoneId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cloudflare"
        description="Status surface for the future Cloudflare integration. Hostnames + zones already declared on AppRegistry are listed below; live sync against the Cloudflare API is not yet wired."
      />

      <div
        className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
          tokenConfigured && accountConfigured
            ? "border-success/30 bg-success/10"
            : "border-warning/40 bg-warning/10"
        }`}
      >
        {tokenConfigured && accountConfigured ? (
          <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        )}
        <div>
          <div
            className={
              tokenConfigured && accountConfigured ? "text-success" : "text-warning"
            }
          >
            {tokenConfigured && accountConfigured
              ? "Credentials configured (API integration not yet wired)"
              : "Credentials not configured"}
          </div>
          <p className="mt-0.5 text-muted-foreground">
            Set <span className="font-mono">CLOUDFLARE_API_TOKEN</span> +{" "}
            <span className="font-mono">CLOUDFLARE_ACCOUNT_ID</span> to prepare for the next
            integration slice. The credentials are reserved here so the env contract is set; Slice
            4 ships only the read surface.
          </p>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Apps with Cloudflare metadata declared ({mapped.length})
        </h2>
        {mapped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No AppRegistry rows carry Cloudflare hostname / zone yet. Edit an app in
            /admin/app-registry to add them.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
            {mapped.map((a) => (
              <li key={a.appKey} className="flex items-center gap-3 p-3 text-sm">
                <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono text-xs">{a.appKey}</span>
                <span className="text-xs text-muted-foreground">{a.name}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {a.cloudflareHostname ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
