/**
 * /admin/public-status — Slice 11.
 *
 * Per-app opt-in surface for the public status page. An admin sees
 * every active app, the live operational status the public page
 * would show, a switch to opt the app into the public listing, and
 * an optional display-name override.
 *
 * Permission: COMMAND_CENTER_MANAGE — same gate as the Sync now
 * button. Reads + mutations are gated; nothing about this surface
 * is visible to support / read-only operators.
 */

import Link from "next/link";
import { ExternalLink, Globe, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { PublicStatusRow } from "@/components/command-center/public-status-row";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const PUBLIC_STATUS_MAP: Record<
  string,
  "operational" | "degraded" | "down" | "unknown"
> = {
  up: "operational",
  degraded: "degraded",
  down: "down",
  unknown: "unknown",
};

export default async function PublicStatusAdminPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.COMMAND_CENTER_MANAGE);

  const apps = await prisma.appRegistry.findMany({
    where: { status: "active" },
    orderBy: [{ publicStatusVisible: "desc" }, { criticality: "desc" }, { name: "asc" }],
    include: {
      healthSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  const visibleCount = apps.filter((a) => a.publicStatusVisible).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Public status page"
        description="Choose which apps appear on status.suite.mactechsolutionsllc.com. Defaults to none — opt apps in explicitly. Display name override lets you show a customer-friendly label on the public surface."
        actions={
          <Link
            href="/status"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Globe className="h-3.5 w-3.5" />
            View public page
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile Icon={Eye} label="Listed" value={visibleCount} tone="default" />
        <Tile
          Icon={EyeOff}
          label="Hidden"
          value={apps.length - visibleCount}
          tone="muted"
        />
        <Tile Icon={Globe} label="Active apps" value={apps.length} tone="muted" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                App
              </th>
              <th className="p-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Live status
              </th>
              <th className="p-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Show publicly
              </th>
              <th className="p-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Public display name
              </th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="p-6 text-center text-sm text-muted-foreground"
                >
                  No active apps in the registry.
                </td>
              </tr>
            ) : (
              apps.map((a) => {
                const live = a.healthSnapshots[0]?.status ?? "unknown";
                const publicStatus =
                  PUBLIC_STATUS_MAP[live] ?? "unknown";
                return (
                  <PublicStatusRow
                    key={a.id}
                    appKey={a.appKey}
                    name={a.name}
                    visible={a.publicStatusVisible}
                    displayName={a.publicStatusName}
                    publicStatus={publicStatus}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4 text-xs text-muted-foreground">
        <p>
          The public page renders only the projection from{" "}
          <code className="font-mono">getPublicStatus()</code> — display name,
          sanitized health rollup, last-checked timestamp. App keys, repo names,
          commit SHAs, and risk descriptions never reach the public surface. To
          point your status subdomain here, CNAME{" "}
          <code className="font-mono">status.suite.mactechsolutionsllc.com</code>{" "}
          at the Suite app and the host-level proxy will route to{" "}
          <code className="font-mono">/status</code>.
        </p>
      </div>
    </div>
  );
}

const TONE = {
  default: "border-border bg-card text-foreground",
  muted: "border-border bg-card/60 text-muted-foreground",
} as const;

function Tile({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: keyof typeof TONE;
}) {
  return (
    <div className={`rounded-lg border p-4 ${TONE[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest">
          {label}
        </span>
        <Icon className="h-3.5 w-3.5 opacity-70" />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
