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
import { AskAIPanel } from "@/components/ai/ask-ai-panel";
import { emailReady } from "@/lib/services/command-center/ai-ask-service";
import { RiskRowActions } from "@/components/command-center/risk-row-actions";

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
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.RISK_VIEW);
  const canEmail = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE);
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

      <AskAIPanel
        contextKey="open_risks"
        canEmail={canEmail}
        emailConfigured={emailReady()}
        presets={[
          "Group the open risks by app and explain which one needs attention first.",
          "Are there any risks suggesting a coordinated incident? Look for clusters in time + category.",
          "Draft a one-paragraph status email to leadership covering the top 3 open risks.",
          "Which mission_critical apps have the most exposure right now and why?",
        ]}
      />

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>App / category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Detected</TableHead>
              <TableHead>Acked</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
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
                    {r.app?.appKey ? (
                      <Link
                        href={`/admin/apps/${r.app.appKey}`}
                        className="font-medium hover:underline"
                      >
                        {r.app.name}
                      </Link>
                    ) : (
                      <span className="font-medium">—</span>
                    )}
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
                <TableCell className="text-right">
                  <RiskRowActions
                    riskId={r.id}
                    status={r.status}
                    category={r.category}
                    title={r.title}
                    appKey={r.app?.appKey ?? null}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border border-border bg-card/40 p-3 text-xs text-muted-foreground">
        <Siren className="mr-1 inline h-3 w-3" />
        Risks auto-resolve when the underlying condition clears. The inline actions are for
        triage:{" "}
        <strong className="text-foreground">Ack</strong> = &quot;I&rsquo;m on it&quot;,{" "}
        <strong className="text-foreground">Resolve</strong> = handled out-of-band, and{" "}
        <strong className="text-foreground">Ignore</strong> = false positive. For categories the
        cross-repo agent can fix automatically (e.g. <code className="font-mono">missing_health_endpoint</code>),
        the row dropdown surfaces a &quot;Fix this with agent&quot; deep-link.
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
