/**
 * Sprint 45 — Vivid stat card.
 *
 * Replaces the shadcn-card-based <Tile> in OverviewTiles for the
 * /command-center route. Single big kinetic number, uppercase
 * eyebrow, sub-line, optional sparkline trail in the accent color.
 *
 * Tone hierarchy:
 *   - "default"   — neutral white text on glass.
 *   - "cyan"      — primary up/healthy state.
 *   - "violet"    — informational / activity.
 *   - "amber"     — degraded / warning.
 *   - "rose"      — down / critical.
 *   - "muted"     — zero / unknown.
 *
 * Tones drive both the accent color of the number/sparkline AND the
 * border-glow of the card; the glass recipe stays the same so the
 * grid reads as a unified surface.
 */

import { cn } from "@/lib/utils";
import { KineticNumber } from "./kinetic-number";
import { Sparkline } from "./sparkline";
// Sprint 55: TiltCard wrap removed — cursor-tracking parallax on a
// dense stat grid was a primary "discombobulated" complaint. The
// underlying glass + accent recipe is preserved.

export type VividStatTone =
  | "default"
  | "cyan"
  | "violet"
  | "amber"
  | "rose"
  | "muted";

const TONE: Record<
  VividStatTone,
  { color: string; border: string; glow: string }
> = {
  default: {
    color: "#F4F6FB",
    border: "border-mt-hairline",
    glow: "",
  },
  cyan: {
    color: "#00E5FF",
    border: "border-mt-cyan/30",
    glow: "shadow-[0_0_0_1px_rgba(0,229,255,0.18),0_8px_24px_-12px_rgba(0,229,255,0.45)]",
  },
  violet: {
    color: "#7C5CFF",
    border: "border-mt-violet/30",
    glow: "shadow-[0_0_0_1px_rgba(124,92,255,0.18),0_8px_24px_-12px_rgba(124,92,255,0.45)]",
  },
  amber: {
    color: "#FFB454",
    border: "border-mt-amber/30",
    glow: "",
  },
  rose: {
    color: "#FF6679",
    border: "border-mt-rose/30",
    glow: "shadow-[0_0_0_1px_rgba(255,102,121,0.18),0_8px_24px_-12px_rgba(255,102,121,0.45)]",
  },
  muted: {
    color: "#8C93A4",
    border: "border-mt-hairline",
    glow: "",
  },
};

export interface VividStatCardProps {
  Icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub: string;
  tone?: VividStatTone;
  /** Optional 24-bucket trail (oldest → newest). */
  spark?: number[];
  /** Optional aria label override for the sparkline. */
  sparkLabel?: string;
}

export function VividStatCard({
  Icon,
  label,
  value,
  sub,
  tone = "default",
  spark,
  sparkLabel,
}: VividStatCardProps) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-mt-3 border bg-mt-surface-1 p-4 transition duration-300 hover:bg-mt-surface-2",
        t.border,
        t.glow,
      )}
      style={{
        backdropFilter: "blur(24px) saturate(150%)",
        WebkitBackdropFilter: "blur(24px) saturate(150%)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
          {label}
        </div>
        {Icon ? (
          <Icon
            className="h-3.5 w-3.5 shrink-0 text-mt-text-4 transition group-hover:text-mt-text-2"
          />
        ) : null}
      </div>
      <div
        className="mt-2 font-mt-display text-3xl font-semibold leading-none tracking-tight md:text-[32px]"
        style={{ color: t.color }}
      >
        <KineticNumber value={value} />
      </div>
      <div className="mt-1 text-[11px] text-mt-text-3">{sub}</div>
      {spark && spark.length > 0 ? (
        <div className="mt-2 -mx-1">
          <Sparkline
            values={spark}
            color={t.color}
            width={140}
            height={28}
            ariaLabel={sparkLabel ?? `${label} trend, last 24h`}
            className="h-7 w-full"
          />
        </div>
      ) : null}
    </div>
  );
}
