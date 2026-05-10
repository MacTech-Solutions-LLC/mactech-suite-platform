/**
 * Sprint 45 — Vivid stat grid.
 *
 * Replaces <OverviewTiles> on /command-center. Server-rendered: the
 * per-metric sparklines are bucketed at the server (zero client JS
 * for trails); only the kinetic number is a client component.
 *
 * Layout: 2-column on mobile, 4-column on desktop. Eight tiles —
 * Apps, Up, Degraded, Down, Open Risks, Critical, Deploys 24h,
 * Agent runs 24h. The first six match the data shape OverviewTiles
 * already used; the last two add a temporal dimension.
 */

import {
  Activity,
  AlertTriangle,
  ShieldOff,
  CircleDot,
  Boxes,
  Siren,
  Rocket,
  Bot,
} from "lucide-react";
import type { CommandCenterStatus } from "@/lib/services/command-center/command-center-service";
import type { TodayDigest } from "@/lib/services/command-center/today-digest-service";
import { VividStatCard } from "@/components/vivid/vivid-stat-card";
import { bucket24hCounts } from "./bucket-24h";

interface Props {
  status: CommandCenterStatus;
  digest: TodayDigest;
}

export function VividStatGrid({ status, digest }: Props) {
  const { byHealth, bySeverity } = status;

  // Sparkline trails — bucket the digest's 24h event lists.
  const deployTrail = bucket24hCounts(
    digest.deploys.map((d) => ({ at: d.checkedAt })),
  );
  const agentTrail = bucket24hCounts(
    digest.agentRuns.map((r) => ({ at: r.completedAt ?? r.createdAt })),
  );
  const riskOpenedTrail = bucket24hCounts(
    digest.risksOpened.map((r) => ({ at: r.detectedAt })),
  );
  const failedDeploys = digest.deploys.filter((d) =>
    /CRASHED|FAILED|REMOVED/i.test(d.railwayStatus),
  );
  const failedDeployTrail = bucket24hCounts(
    failedDeploys.map((d) => ({ at: d.checkedAt })),
  );

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <VividStatCard
        Icon={Boxes}
        label="Apps"
        value={status.totalApps}
        sub={
          status.appsMissingHealthUrl > 0
            ? `${status.appsMissingHealthUrl} missing health URL`
            : "all probed"
        }
        tone="default"
      />
      <VividStatCard
        Icon={Activity}
        label="Up"
        value={byHealth.up}
        sub={byHealth.unknown > 0 ? `${byHealth.unknown} unknown` : "all reachable"}
        tone="cyan"
      />
      <VividStatCard
        Icon={AlertTriangle}
        label="Degraded"
        value={byHealth.degraded}
        sub={byHealth.degraded === 0 ? "no degradations" : "investigate"}
        tone={byHealth.degraded === 0 ? "muted" : "amber"}
      />
      <VividStatCard
        Icon={ShieldOff}
        label="Down"
        value={byHealth.down}
        sub={byHealth.down === 0 ? "all reachable" : "page on-call"}
        tone={byHealth.down === 0 ? "muted" : "rose"}
      />
      <VividStatCard
        Icon={Siren}
        label="Open risks"
        value={status.openRiskCount}
        sub={
          status.criticalRiskCount > 0
            ? `${status.criticalRiskCount} high/critical`
            : "no high-severity"
        }
        tone={status.criticalRiskCount > 0 ? "rose" : "muted"}
        spark={riskOpenedTrail}
        sparkLabel="Risks opened per hour, last 24h"
      />
      <VividStatCard
        Icon={CircleDot}
        label="Critical"
        value={bySeverity.critical}
        sub={`${bySeverity.high} high · ${bySeverity.medium} med`}
        tone={bySeverity.critical > 0 ? "rose" : "muted"}
      />
      <VividStatCard
        Icon={Rocket}
        label="Deploys 24h"
        value={digest.deploys.length}
        sub={
          failedDeploys.length > 0
            ? `${failedDeploys.length} failed`
            : "all clean"
        }
        tone={failedDeploys.length > 0 ? "amber" : "cyan"}
        spark={failedDeploys.length > 0 ? failedDeployTrail : deployTrail}
        sparkLabel={
          failedDeploys.length > 0
            ? "Failed deploys per hour, last 24h"
            : "Deploys per hour, last 24h"
        }
      />
      <VividStatCard
        Icon={Bot}
        label="Agent runs 24h"
        value={digest.agentRuns.length}
        sub={
          digest.criticalNow.refusedAgentRuns24h > 0
            ? `${digest.criticalNow.refusedAgentRuns24h} refused by IBE`
            : "no refusals"
        }
        tone={digest.criticalNow.refusedAgentRuns24h > 0 ? "rose" : "violet"}
        spark={agentTrail}
        sparkLabel="Agent runs per hour, last 24h"
      />
    </div>
  );
}
