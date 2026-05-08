/**
 * /admin/ops/risk — full triage view of every open OperationalRiskFlag.
 * Slice 1's overview tile shows the count; this page is the action
 * surface (sort, filter, ack/resolve).
 */

import Link from "next/link";
import { Siren, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { RiskBadge } from "@/components/ui/risk-badge";
import { Button } from "@/components/ui/button";
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
import { getOpenRiskFlags } from "@/lib/services/command-center/command-center-service";

export const dynamic = "force-dynamic";

interface SearchParams {
  category?: string;
  severity?: string;
}

export default async function RiskPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.RISK_VIEW);
  const all = await getOpenRiskFlags(200);

  const filtered = all.filter((r) => {
    if (searchParams?.category && r.category !== searchParams.category) return false;
    if (searchParams?.severity && r.severity !== searchParams.severity) return false;
    return true;
  });

  // Group counts for the filter pills.
  const byCat = new Map<string, number>();
  const bySev = new Map<string, number>();
  for (const r of all) {
    byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
    bySev.set(r.severity, (bySev.get(r.severity) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Runtime Risk"
        description="Every currently-open OperationalRiskFlag, severity-sorted. Risks open + auto-resolve based on the live state of the ecosystem; manual ack lets you signal triage in progress without losing the flag."
        actions={<span className="text-xs text-muted-foreground">{all.length} open</span>}
      />

      <div className="flex flex-wrap gap-2">
        <FilterChip
          label="all"
          active={!searchParams?.category && !searchParams?.severity}
          href="/admin/ops/risk"
          count={all.length}
        />
        {(["critical", "high", "medium", "low"] as const).map((sev) => (
          <FilterChip
            key={sev}
            label={sev}
            active={searchParams?.severity === sev}
            href={`/admin/ops/risk?severity=${sev}`}
            count={bySev.get(sev) ?? 0}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>App / category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Detected</TableHead>
              <TableHead>Acked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  <ShieldCheck className="mx-auto mb-2 h-4 w-4 text-success" />
                  No open risks matching this filter. Quiet is the goal.
                </TableCell>
              </TableRow>
            ) : null}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <RiskBadge severity={r.severity} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{r.app?.name ?? "—"}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {r.category}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-md text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{r.title}</div>
                  {r.description ? <div className="mt-0.5 line-clamp-2">{r.description}</div> : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.detectedAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.acknowledgedAt ? (
                    <span>
                      <ShieldCheck className="mr-1 inline h-3 w-3 text-success" />
                      {r.acknowledgedBy}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border border-border bg-card/40 p-3 text-xs text-muted-foreground">
        <Siren className="mr-1 inline h-3 w-3" />
        Risks auto-resolve when the underlying condition clears. Manual ack/resolve actions ship in
        the next AgentOps slice — until then, fix the root cause and watch the flag drop on the next
        reconciliation pass.
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  href,
  count,
}: {
  label: string;
  active: boolean;
  href: string;
  count: number;
}) {
  return (
    <Button asChild size="sm" variant={active ? "default" : "outline"}>
      <Link href={href}>
        {label}
        <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-[10px] font-mono text-muted-foreground">
          {count}
        </span>
      </Link>
    </Button>
  );
}
