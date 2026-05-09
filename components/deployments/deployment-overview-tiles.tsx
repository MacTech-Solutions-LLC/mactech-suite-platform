/**
 * DeploymentOverviewTiles — Slice 12.
 *
 * Six-tile hero for /admin/ops/deployments. Reads at executive-glance
 * cadence: total resources tracked, live success/failed counts, drift
 * rollup, stale-deployment count, 24h success rate.
 */

import {
  Boxes,
  CheckCircle2,
  ShieldOff,
  GitCompare,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DeploymentsOverview } from "@/lib/services/command-center/deployment-intelligence-service";

const TONE = {
  default: "border-border bg-card text-foreground",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/30 bg-warning/5",
  destructive: "border-destructive/30 bg-destructive/5",
  muted: "border-border bg-card/60 text-muted-foreground",
} as const;

export function DeploymentOverviewTiles({
  overview,
}: {
  overview: DeploymentsOverview;
}) {
  const liveCount = overview.byStatus.success;
  const brokenCount = overview.byStatus.failed + overview.byStatus.crashed;
  const driftedCount =
    overview.byDrift.behind + overview.byDrift.ahead + overview.byDrift.diverged;
  const successRate = overview.successRate24h;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Tile
        Icon={Boxes}
        label="Tracked"
        value={overview.totalResources}
        sub="services × envs"
        tone="default"
      />
      <Tile
        Icon={CheckCircle2}
        label="Live"
        value={liveCount}
        sub={
          liveCount === overview.totalResources
            ? "all running"
            : `${overview.totalResources - liveCount} not live`
        }
        tone={liveCount > 0 ? "success" : "muted"}
      />
      <Tile
        Icon={ShieldOff}
        label="Broken"
        value={brokenCount}
        sub={
          brokenCount === 0
            ? "all green"
            : `${overview.byStatus.failed} failed · ${overview.byStatus.crashed} crashed`
        }
        tone={brokenCount > 0 ? "destructive" : "muted"}
      />
      <Tile
        Icon={GitCompare}
        label="Drift"
        value={driftedCount}
        sub={
          driftedCount === 0
            ? "all in sync"
            : `${overview.byDrift.behind} behind · ${overview.byDrift.diverged} diverged`
        }
        tone={driftedCount > 0 ? "warning" : "muted"}
      />
      <Tile
        Icon={Clock}
        label="Stale"
        value={overview.staleResourceCount}
        sub={overview.staleResourceCount === 0 ? "no stale deploys" : "no deploy in 14d"}
        tone={overview.staleResourceCount > 0 ? "warning" : "muted"}
      />
      <Tile
        Icon={TrendingUp}
        label="24h success"
        value={successRate === null ? "—" : `${successRate}%`}
        sub={
          successRate === null
            ? "no deploys in 24h"
            : `${overview.failedDeployments24h} failed`
        }
        tone={
          successRate === null
            ? "muted"
            : successRate >= 95
              ? "success"
              : successRate >= 80
                ? "warning"
                : "destructive"
        }
      />
    </div>
  );
}

function Tile({
  Icon,
  label,
  value,
  sub,
  tone,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub: string;
  tone: keyof typeof TONE;
}) {
  return (
    <Card className={`overflow-hidden ${TONE[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest">
            {label}
          </span>
          <Icon className="h-3.5 w-3.5 opacity-70" />
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
