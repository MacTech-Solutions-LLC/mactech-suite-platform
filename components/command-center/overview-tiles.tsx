import {
  Activity,
  AlertTriangle,
  ShieldOff,
  CircleDot,
  Boxes,
  Siren,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CommandCenterStatus } from "@/lib/services/command-center/command-center-service";

interface Props {
  status: CommandCenterStatus;
}

/**
 * The four-row hero of /command-center. Sized to read at executive-glance
 * cadence: total apps, ecosystem health rollup, open risk severity rollup,
 * and the trailing "everything else" tile.
 */
export function OverviewTiles({ status }: Props) {
  const totalApps = status.totalApps;
  const { byHealth, bySeverity } = status;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile
        Icon={Boxes}
        label="Apps"
        value={totalApps}
        sub={`${status.appsMissingHealthUrl} missing health URL`}
        tone="default"
      />
      <Tile
        Icon={Activity}
        label="Up"
        value={byHealth.up}
        sub={byHealth.unknown > 0 ? `${byHealth.unknown} unknown` : "all probed"}
        tone="success"
      />
      <Tile
        Icon={AlertTriangle}
        label="Degraded"
        value={byHealth.degraded}
        sub={byHealth.degraded === 0 ? "no degradations" : "investigate"}
        tone={byHealth.degraded === 0 ? "muted" : "warning"}
      />
      <Tile
        Icon={ShieldOff}
        label="Down"
        value={byHealth.down}
        sub={byHealth.down === 0 ? "all reachable" : "page on-call"}
        tone={byHealth.down === 0 ? "muted" : "destructive"}
      />
      <Tile
        Icon={Siren}
        label="Open risks"
        value={status.openRiskCount}
        sub={
          status.criticalRiskCount > 0
            ? `${status.criticalRiskCount} high/critical`
            : "no high-severity"
        }
        tone={status.criticalRiskCount > 0 ? "destructive" : "muted"}
      />
      <Tile
        Icon={CircleDot}
        label="Critical"
        value={bySeverity.critical}
        sub={`${bySeverity.high} high · ${bySeverity.medium} med`}
        tone={bySeverity.critical > 0 ? "destructive" : "muted"}
      />
      <Tile
        Icon={AlertTriangle}
        label="Medium"
        value={bySeverity.medium}
        sub={`${bySeverity.low} low · ${bySeverity.info} info`}
        tone="muted"
      />
      <Tile
        Icon={HelpCircle}
        label="Unknown"
        value={byHealth.unknown}
        sub="missing endpoint or unreachable"
        tone="muted"
      />
    </div>
  );
}

const TONE = {
  default: "border-border bg-card text-foreground",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/30 bg-warning/5",
  destructive: "border-destructive/30 bg-destructive/5",
  muted: "border-border bg-card/60 text-muted-foreground",
} as const;

function Tile({
  Icon,
  label,
  value,
  sub,
  tone,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
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
