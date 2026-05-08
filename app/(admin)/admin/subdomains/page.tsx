/**
 * /admin/subdomains — every public-facing app subdomain in one place.
 * Reads off AppRegistry.subdomain + apexDomain + cloudflare* fields
 * (Slice 1 schema additions). Cloudflare-aware columns are
 * placeholder until Slice 4-follow-up wires the Cloudflare API.
 */

import Link from "next/link";
import { ExternalLink, Globe2 } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function SubdomainsPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.SUBDOMAINS_VIEW);
  const apps = await prisma.appRegistry.findMany({
    where: { status: "active" },
    orderBy: [{ apexDomain: "asc" }, { subdomain: "asc" }],
    include: {
      healthSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subdomains"
        description="Every public-facing MacTech app subdomain. Drives the customer DNS surface — apps marked active here are also the ones that show up in Apple/Google sitemaps and customer onboarding emails."
      />

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subdomain</TableHead>
              <TableHead>App</TableHead>
              <TableHead>Public URL</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Cloudflare</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.map((a) => {
              const fqdn =
                a.subdomain && a.apexDomain
                  ? `${a.subdomain}.${a.apexDomain}`
                  : a.publicUrl
                    ? new URL(a.publicUrl).host
                    : null;
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="inline-flex items-center gap-1 font-mono text-xs">
                      <Globe2 className="h-3 w-3 text-muted-foreground" />
                      {fqdn ?? <span className="text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{a.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {a.appKey}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.publicUrl ? (
                      <Link
                        href={a.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {a.publicUrl}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={a.healthSnapshots[0]?.status ?? "unknown"} />
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {a.cloudflareHostname ? (
                      <span>{a.cloudflareHostname}</span>
                    ) : (
                      <span className="text-muted-foreground/60">not mapped</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
