/**
 * Sprint 55 — Inline count chips for the Zone B "Last 24 hours" header.
 *
 * Replaces the 8-tile VividStatGrid (LP1 sub-item, locked answer #4 in
 * the research brief). The grid was redundant with the brushable chart
 * + the AttentionRail + the apps table. We keep four chips inline
 * with the Zone B title so the operator still gets at-a-glance counts
 * for the four numbers worth knowing:
 *
 *   - Apps total (info, neutral)
 *   - Deploys 24h (info, cyan)
 *   - Risks opened 24h (info, neutral; rose when any critical)
 *   - Agent runs 24h (info, violet — AgentOps owns this color)
 *
 * Strict color semantics:
 *   - cyan = primary/info
 *   - violet = AgentOps-specific
 *   - rose = critical/destructive (only when count > 0)
 *   - neutral when the number is benign
 *
 * No KineticNumber, no sparkline, no glass. Chips are flat hairlined
 * pills — the brushable chart below them carries the trend story.
 */

import type { CommandCenterStatus } from "@/lib/services/command-center/command-center-service";
import type { TodayDigest } from "@/lib/services/command-center/today-digest-service";

interface Props {
  status: CommandCenterStatus;
  digest: TodayDigest;
}

interface Chip {
  label: string;
  value: number;
  tone: "neutral" | "cyan" | "violet" | "rose";
}

export function ZoneBChips({ status, digest }: Props) {
  const failedDeploys = digest.deploys.filter((d) =>
    /CRASHED|FAILED|REMOVED/i.test(d.railwayStatus),
  ).length;

  const chips: Chip[] = [
    {
      label: "Apps",
      value: status.totalApps,
      tone: "neutral",
    },
    {
      label: "Deploys",
      value: digest.deploys.length,
      tone: failedDeploys > 0 ? "rose" : "cyan",
    },
    {
      label: "Risks opened",
      value: digest.risksOpened.length,
      tone: digest.criticalNow.openCriticalRisks > 0 ? "rose" : "neutral",
    },
    {
      label: "Agent runs",
      value: digest.agentRuns.length,
      tone: "violet",
    },
  ];

  return (
    <>
      {chips.map((c) => (
        <Chip key={c.label} {...c} />
      ))}
    </>
  );
}

function Chip({ label, value, tone }: Chip) {
  const cls =
    tone === "cyan"
      ? "border-mt-cyan/30 text-mt-cyan"
      : tone === "violet"
        ? "border-mt-violet/30 text-mt-violet"
        : tone === "rose"
          ? "border-mt-rose/30 text-mt-rose"
          : "border-mt-hairline text-mt-text-2";
  return (
    <span
      className={`inline-flex items-baseline gap-2 rounded-mt-2 border bg-mt-surface-1 px-2.5 py-1 ${cls}`}
    >
      <span className="font-mt-mono text-[10px] uppercase tracking-[0.16em] text-mt-text-3">
        {label}
      </span>
      <span className="font-mt-display text-sm font-semibold tabular-nums">
        {value}
      </span>
    </span>
  );
}
