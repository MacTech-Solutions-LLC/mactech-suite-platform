/**
 * /admin/ops/traffic — observed inter-app traffic.
 *
 * Powered by AppCallEvent rows captured at instrumented endpoints
 * (/api/audit/ingest + /api/v1/agents/runs in v1; webhook routes are
 * a follow-up). Two views in one page:
 *   1. Top-of-page summary: pair-level aggregate over the time window
 *      (default 24h), filterable to one source/target via query params.
 *   2. Bottom: raw call log with the most recent ~250 events.
 *
 * Permission: platform:ops:view (same gate as the ecosystem page).
 */

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  AlertTriangle,
  Filter,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  getTrafficSummaryByPair,
  listRecentCallEvents,
} from "@/lib/services/command-center/traffic-service";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

interface SearchParams {
  /** appId (target) — filter inbound traffic to a specific app. */
  to?: string;
  /** appKey (source) — filter to a specific source. */
  from?: string;
  /** target label (e.g. "github", "openai") — filter outbound calls. */
  toLabel?: string;
  /** time window in hours; default 24. */
  windowH?: string;
  errorsOnly?: string;
}

const EXTERNAL_LABELS = ["github", "railway", "openai", "clerk"] as const;

export default async function TrafficPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);

  const windowHours = clampInt(searchParams?.windowH, 1, 720, 24);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // Resolve filter app for the pair view; the source filter uses the
  // textual sourceLabel to also catch non-app sources like "github".
  const targetAppId = searchParams?.to ?? undefined;
  const sourceLabel = searchParams?.from ?? undefined;
  const targetLabel = searchParams?.toLabel ?? undefined;
  const errorsOnly = searchParams?.errorsOnly === "1";

  const [pairs, recent, apps] = await Promise.all([
    getTrafficSummaryByPair({
      since,
      targetAppRegistryId: targetAppId,
      targetLabel,
      sourceLabel,
    }),
    listRecentCallEvents({
      since,
      sourceLabel,
      targetLabel,
      targetAppRegistryId: targetAppId,
      errorsOnly,
      take: 250,
    }),
    prisma.appRegistry.findMany({
      where: { status: "active" },
      select: { id: true, appKey: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const appsById = new Map(apps.map((a) => [a.id, a]));
  const totalCalls = pairs.reduce((n, p) => n + p.callCount, 0);
  const totalErrors = pairs.reduce((n, p) => n + p.errorCount, 0);
  const totalBytes = pairs.reduce((n, p) => n + p.bytesIn, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Traffic"
        description={`Observed inbound HTTP calls between apps captured at instrumented Suite endpoints. Window: last ${windowHours}h. AppDependency declares the edge surface; AppCallEvent records what actually flowed.`}
        actions={
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" aria-hidden="true" />
            {totalCalls} calls · {totalErrors} errors · {formatBytes(totalBytes)} in
          </span>
        }
      />

      <FilterBar
        windowHours={windowHours}
        targetAppId={targetAppId}
        sourceLabel={sourceLabel}
        targetLabel={targetLabel}
        errorsOnly={errorsOnly}
        apps={apps}
      />

      {pairs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <Activity className="mx-auto mb-2 h-4 w-4" />
          No observed traffic in this window. Once any sibling app POSTs to{" "}
          <code className="font-mono text-xs">/api/audit/ingest</code> or any
          M2M caller hits{" "}
          <code className="font-mono text-xs">/api/v1/agents/runs</code>, rows
          land here.
        </div>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Pairs ({pairs.length})
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
            {pairs
              .sort((a, b) => b.callCount - a.callCount)
              .map((p) => {
                const src = p.sourceAppRegistryId
                  ? appsById.get(p.sourceAppRegistryId)
                  : null;
                const tgt = p.targetAppRegistryId
                  ? appsById.get(p.targetAppRegistryId)
                  : null;
                const errPct = p.callCount > 0 ? (p.errorCount / p.callCount) * 100 : 0;
                const key = `${p.sourceLabel}-${p.targetLabel}-${p.targetAppRegistryId ?? "none"}-${p.sourceAppRegistryId ?? "none"}`;
                // Display name falls through: AppRegistry name if we
                // have it; otherwise the canonical label (which is
                // also the name for external services like "github").
                const sourceName = src?.name ?? p.sourceLabel;
                const targetName = tgt?.name ?? p.targetLabel;
                return (
                  <li key={key} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{sourceName}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{targetName}</span>
                        {p.errorCount > 0 ? (
                          <Badge variant="destructive">{p.errorCount} err</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{p.callCount} call{p.callCount === 1 ? "" : "s"}</span>
                        <span>· {formatBytes(p.bytesIn)} in</span>
                        {errPct > 0 ? <span>· {errPct.toFixed(1)}% errors</span> : null}
                        <span>· last {p.lastSeenAt.toLocaleString()}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Recent calls ({recent.length})
        </h2>
        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No recent calls match these filters.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-card/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Source → Target</th>
                  <th className="px-3 py-2 text-left">Endpoint</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Bytes</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((r) => (
                  <tr key={r.id} className={r.statusCode >= 400 ? "bg-destructive/5" : ""}>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      {r.occurredAt.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      <span className="font-medium">{r.sourceLabel}</span>
                      <ArrowRight
                        className="mx-1 inline h-3 w-3 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="font-medium">{r.targetLabel}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      <span className="text-muted-foreground">{r.method}</span> {r.endpoint}
                    </td>
                    <td className="px-3 py-2">
                      <StatusCell code={r.statusCode} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-muted-foreground">
                      {formatBytes(r.bytesIn)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-muted-foreground">
                      {r.durationMs != null ? `${r.durationMs}ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number) {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function StatusCell({ code }: { code: number }) {
  const variant: "success" | "warning" | "destructive" =
    code < 400 ? "success" : code < 500 ? "warning" : "destructive";
  return <Badge variant={variant}>{code}</Badge>;
}

function FilterBar(props: {
  windowHours: number;
  targetAppId: string | undefined;
  sourceLabel: string | undefined;
  targetLabel: string | undefined;
  errorsOnly: boolean;
  apps: Array<{ id: string; appKey: string; name: string }>;
}) {
  const apps = props.apps;
  const buildHref = (next: Partial<SearchParams>): string => {
    const params = new URLSearchParams();
    const merged: SearchParams = {
      to: props.targetAppId,
      from: props.sourceLabel,
      toLabel: props.targetLabel,
      windowH: String(props.windowHours),
      errorsOnly: props.errorsOnly ? "1" : undefined,
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== "") params.set(k, v);
    }
    const q = params.toString();
    return q ? `/admin/ops/traffic?${q}` : "/admin/ops/traffic";
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/40 p-3 text-xs">
      <Filter className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">Filter:</span>

      <Link
        href={buildHref({ windowH: "1" })}
        className={chipClass(props.windowHours === 1)}
        aria-pressed={props.windowHours === 1}
      >
        1h
      </Link>
      <Link
        href={buildHref({ windowH: "24" })}
        className={chipClass(props.windowHours === 24)}
        aria-pressed={props.windowHours === 24}
      >
        24h
      </Link>
      <Link
        href={buildHref({ windowH: "168" })}
        className={chipClass(props.windowHours === 168)}
        aria-pressed={props.windowHours === 168}
      >
        7d
      </Link>

      <span className="ml-2 text-muted-foreground">target app:</span>
      <Link
        href={buildHref({ to: undefined })}
        className={chipClass(!props.targetAppId)}
        aria-pressed={!props.targetAppId}
      >
        any
      </Link>
      {apps.map((a) => (
        <Link
          key={a.id}
          href={buildHref({ to: a.id })}
          className={chipClass(props.targetAppId === a.id)}
          aria-pressed={props.targetAppId === a.id}
        >
          {a.appKey}
        </Link>
      ))}

      <span className="ml-2 text-muted-foreground">target service:</span>
      <Link
        href={buildHref({ toLabel: undefined })}
        className={chipClass(!props.targetLabel)}
        aria-pressed={!props.targetLabel}
      >
        any
      </Link>
      <Link
        href={buildHref({ toLabel: "identity-command-center" })}
        className={chipClass(props.targetLabel === "identity-command-center")}
        aria-pressed={props.targetLabel === "identity-command-center"}
      >
        suite (inbound)
      </Link>
      {EXTERNAL_LABELS.map((label) => (
        <Link
          key={label}
          href={buildHref({ toLabel: label })}
          className={chipClass(props.targetLabel === label)}
          aria-pressed={props.targetLabel === label}
        >
          {label}
        </Link>
      ))}

      <Link
        href={buildHref({ errorsOnly: props.errorsOnly ? undefined : "1" })}
        className={`ml-2 ${chipClass(props.errorsOnly)}`}
        aria-pressed={props.errorsOnly}
      >
        {props.errorsOnly ? (
          <>
            <XCircle className="mr-1 inline h-3 w-3" aria-hidden="true" />
            errors only
          </>
        ) : (
          <>
            <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />
            errors only
          </>
        )}
      </Link>

      {(props.targetAppId || props.sourceLabel || props.targetLabel || props.errorsOnly) ? (
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/ops/traffic">clear</Link>
        </Button>
      ) : null}
    </div>
  );
}

function chipClass(active: boolean): string {
  return [
    "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    active
      ? "border-primary bg-primary/15 text-primary"
      : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary",
  ].join(" ");
}
