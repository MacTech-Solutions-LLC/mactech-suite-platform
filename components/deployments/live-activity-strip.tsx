/**
 * LiveActivityStrip — Sprint 34.
 *
 * The hero of /admin/ops/deployments: three side-by-side cards
 * answering "what is Railway doing right now?":
 *
 *   - In flight        — pulse on each row; what's deploying + how long
 *   - Recently crashed — last 24h failures; "last green X ago" inline
 *   - Just shipped     — last 1h successes; reads like a release radio
 *
 * Server component. Re-renders on every router.refresh() call from
 * the LiveAutoRefresh sibling (see ./live-auto-refresh.tsx).
 *
 * Rows are clickable to /admin/apps/<appKey> for a deeper look; an
 * external icon links to the Railway dashboard for raw logs.
 */

import Link from "next/link";
import {
  ExternalLink,
  Hammer,
  RotateCw,
  Loader2,
  CheckCircle2,
  ShieldOff,
  Activity,
  Rocket,
  Clock,
} from "lucide-react";
import { DiagnoseButton } from "./diagnose-button";
import type {
  LiveDeployActivity,
  LiveDeployRow,
} from "@/lib/services/command-center/live-deployments-service";
import type { DeploymentStatus } from "@prisma/client";

interface Props {
  activity: LiveDeployActivity;
}

export function LiveActivityStrip({ activity }: Props) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <ActivityCard
        title="In flight"
        accent="info"
        rows={activity.inFlight}
        empty="Nothing deploying right now."
        renderRow={(r) => <InFlightRow row={r} key={r.id} />}
      />
      <ActivityCard
        title="Recently crashed"
        accent="destructive"
        rows={activity.recentlyFailed}
        empty="No failures in the last 24h."
        renderRow={(r) => <CrashedRow row={r} key={r.id} />}
      />
      <ActivityCard
        title="Just shipped"
        accent="success"
        rows={activity.recentlyShipped}
        empty="No shipments in the last hour."
        renderRow={(r) => <ShippedRow row={r} key={r.id} />}
      />
    </div>
  );
}

const ACCENT = {
  info: "border-primary/30 bg-primary/5",
  destructive: "border-destructive/30 bg-destructive/5",
  success: "border-success/30 bg-success/5",
} as const;

function ActivityCard({
  title,
  accent,
  rows,
  empty,
  renderRow,
}: {
  title: string;
  accent: keyof typeof ACCENT;
  rows: LiveDeployRow[];
  empty: string;
  renderRow: (r: LiveDeployRow) => React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${ACCENT[accent]} p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground">
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
          {empty}
        </div>
      ) : (
        <ul className="space-y-1.5">{rows.map(renderRow)}</ul>
      )}
    </div>
  );
}

function InFlightRow({ row }: { row: LiveDeployRow }) {
  const Icon = inFlightIcon(row.status);
  const label = row.status.replace(/_/g, " ");
  return (
    <li className="overflow-hidden rounded-md border border-border bg-background/40">
      <RowLink row={row}>
        <div className="flex items-start gap-2 p-2.5">
          <span className="relative mt-1 inline-flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="truncate group-hover:text-primary">
                {row.appName ?? row.serviceName ?? row.appKey ?? "?"}
              </span>
              {row.appKey && row.appName ? (
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {row.appKey}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                <Icon className="h-2.5 w-2.5 animate-spin" />
                {label}
              </span>
              {row.liveCommitShortSha ? (
                <span className="font-mono">{row.liveCommitShortSha}</span>
              ) : null}
              {row.liveBranch ? (
                <>
                  <span>·</span>
                  <span className="font-mono">{row.liveBranch}</span>
                </>
              ) : null}
              <span>· {timeAgo(row.checkedAt)}</span>
            </div>
          </div>
          <ExternalRailwayLink row={row} />
        </div>
      </RowLink>
    </li>
  );
}

function CrashedRow({ row }: { row: LiveDeployRow }) {
  const Icon = row.status === "crashed" ? Activity : ShieldOff;
  return (
    <li className="overflow-hidden rounded-md border border-destructive/40 bg-background/40">
      <RowLink row={row}>
        <div className="flex items-start gap-2 p-2.5">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="truncate group-hover:text-primary">
                {row.appName ?? row.serviceName ?? row.appKey ?? "?"}
              </span>
              <span className="rounded-sm bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-destructive">
                {row.status}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {row.liveCommitShortSha ? (
                <span className="font-mono">{row.liveCommitShortSha}</span>
              ) : null}
              <span className="text-destructive">{timeAgo(row.checkedAt)}</span>
              {row.lastSuccessAt ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  last green {timeAgo(row.lastSuccessAt)}
                </span>
              ) : (
                <span>no green deploy on record</span>
              )}
            </div>
            {row.errorMessage ? (
              <div className="mt-1 line-clamp-2 text-[11px] text-destructive/80">
                {row.errorMessage}
              </div>
            ) : null}
          </div>
          <ExternalRailwayLink row={row} />
        </div>
      </RowLink>
      {/* Sprint 36: Diagnose expander pulls Railway buildLogs on
          demand and surfaces the failure root-cause + tail. Lives
          OUTSIDE the RowLink so clicking it doesn't navigate. */}
      <div className="border-t border-destructive/40 p-2.5">
        <DiagnoseButton
          snapshotId={row.id}
          appKey={row.appKey}
          appName={row.appName}
          repoFullName={row.repoFullName}
        />
      </div>
    </li>
  );
}

function ShippedRow({ row }: { row: LiveDeployRow }) {
  return (
    <li className="overflow-hidden rounded-md border border-success/40 bg-background/40">
      <RowLink row={row}>
        <div className="flex items-start gap-2 p-2.5">
          <Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="truncate group-hover:text-primary">
                {row.appName ?? row.serviceName ?? row.appKey ?? "?"}
              </span>
              <CheckCircle2 className="h-3 w-3 text-success" />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {row.liveCommitShortSha ? (
                <span className="font-mono">{row.liveCommitShortSha}</span>
              ) : null}
              {row.liveBranch ? (
                <span className="font-mono">{row.liveBranch}</span>
              ) : null}
              <span>· {timeAgo(row.checkedAt)}</span>
            </div>
          </div>
          <ExternalRailwayLink row={row} />
        </div>
      </RowLink>
    </li>
  );
}

/** Whole-row hyperlink. Falls back to the Railway dashboard if we
 *  don't have an internal app to drill into. */
function RowLink({
  row,
  children,
}: {
  row: LiveDeployRow;
  children: React.ReactNode;
}) {
  const internal = row.appKey ? `/admin/apps/${row.appKey}` : null;
  if (internal) {
    return (
      <Link href={internal} className="group block hover:bg-muted/30">
        {children}
      </Link>
    );
  }
  if (row.railwayDashboardUrl) {
    return (
      <a
        href={row.railwayDashboardUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group block hover:bg-muted/30"
      >
        {children}
      </a>
    );
  }
  return <div className="group block">{children}</div>;
}

function ExternalRailwayLink({ row }: { row: LiveDeployRow }) {
  if (!row.railwayDashboardUrl) return null;
  // Server component → can't carry an onClick handler. The native
  // click on this inner <a target="_blank"> opens its own tab; the
  // outer RowLink doesn't fire because the inner anchor handles
  // the event.
  return (
    <a
      href={row.railwayDashboardUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 text-muted-foreground hover:text-foreground"
      aria-label="Open in Railway"
      title="Open in Railway"
    >
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function inFlightIcon(s: DeploymentStatus): React.ComponentType<{ className?: string }> {
  if (s === "building") return Hammer;
  if (s === "restarting") return RotateCw;
  if (s === "queued" || s === "initializing") return Loader2;
  return Loader2;
}

function timeAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

