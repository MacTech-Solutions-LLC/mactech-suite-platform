/**
 * RecentDeployments — Slice 12.
 *
 * Cross-app deploy timeline. Different shape from DeploymentTable
 * (which is per-resource latest-state). This component answers
 * "what just happened across the whole ecosystem" — chronological,
 * deduplicated by deployment id, with drift indicator inline so
 * you can spot stale-but-deploying-fine apps at a glance.
 */

import { GitCompare } from "lucide-react";
import { DeploymentStatusPill } from "./deployment-status-pill";
import { Badge } from "@/components/ui/badge";
import type { RecentDeployment } from "@/lib/services/command-center/deployment-intelligence-service";

export function RecentDeployments({ rows }: { rows: RecentDeployment[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No deploys recorded yet. Once Railway sync runs, the most recent deploys
        across every tracked service will appear here.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {rows.map((d) => (
        <li key={d.id} className="flex items-center gap-3 p-3">
          <DeploymentStatusPill
            status={(d.railwayStatus ?? "unknown") as never}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">
                {d.appName ?? d.serviceName ?? "?"}
              </span>
              {d.appKey && d.appName ? (
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {d.appKey}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {d.serviceName && d.appName ? (
                <>
                  <span className="font-mono">{d.serviceName}</span>
                  <span>·</span>
                </>
              ) : null}
              {d.liveCommitShortSha ? (
                <span className="font-mono">{d.liveCommitShortSha}</span>
              ) : null}
              {d.liveBranch ? (
                <>
                  <span>·</span>
                  <span className="font-mono">{d.liveBranch}</span>
                </>
              ) : null}
              {d.productionDriftStatus !== "in_sync" &&
              d.productionDriftStatus !== "unknown" ? (
                <DriftBadge
                  status={d.productionDriftStatus}
                  commitsBehind={d.commitsBehind}
                />
              ) : null}
            </div>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {timeAgo(d.checkedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DriftBadge({
  status,
  commitsBehind,
}: {
  status: string;
  commitsBehind: number | null;
}) {
  const variant =
    status === "diverged"
      ? "destructive"
      : status === "behind"
        ? "warning"
        : "muted";
  const label =
    status === "behind" && commitsBehind && commitsBehind > 0
      ? `behind ${commitsBehind}`
      : status;
  return (
    <Badge variant={variant} className="gap-1">
      <GitCompare className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}

function timeAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
