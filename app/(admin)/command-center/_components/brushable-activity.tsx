"use client";

/**
 * Sprint 46 — brushable 24h activity chart (Vivid /command-center).
 *
 * Stacked area chart over the last 24 hourly buckets. Series:
 *   - deploys (cyan)
 *   - agent runs (violet)
 *   - risks opened (rose)
 *   - failed workflows (amber)
 *
 * The shadcn-recipe brush at the bottom lets the operator drag a
 * window over the timeline; the headline counts above the chart
 * recompute to that window. When no brush is set, the headline shows
 * the full 24h totals.
 *
 * Why client: recharts is interactive (brush + tooltip). The data
 * arrives pre-bucketed from the server, so the wire payload is tiny
 * (24 rows × 5 numbers).
 */

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface BrushableRow {
  /** Hour-start ms. */
  t: number;
  deploys: number;
  agentRuns: number;
  risksOpened: number;
  failedWorkflows: number;
}

interface Props {
  rows: BrushableRow[];
}

const COLORS = {
  deploys: "#00E5FF",
  agentRuns: "#7C5CFF",
  risksOpened: "#FF6679",
  failedWorkflows: "#FFB454",
} as const;

const LABELS: Record<keyof typeof COLORS, string> = {
  deploys: "Deploys",
  agentRuns: "Agent runs",
  risksOpened: "Risks opened",
  failedWorkflows: "Failed workflows",
};

function fmtHour(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h.toString().padStart(2, "0")}:00`;
}

export function BrushableActivity({ rows }: Props) {
  // Brush window — defaults to full range. Recharts gives us index
  // bounds in onChange; we mirror them in state so the headline
  // reflects the visible slice.
  const [range, setRange] = useState<[number, number]>([0, rows.length - 1]);

  const totals = useMemo(() => {
    const [a, b] = range;
    const slice = rows.slice(a, b + 1);
    const sum = (k: keyof typeof COLORS) =>
      slice.reduce((acc, r) => acc + r[k], 0);
    return {
      deploys: sum("deploys"),
      agentRuns: sum("agentRuns"),
      risksOpened: sum("risksOpened"),
      failedWorkflows: sum("failedWorkflows"),
      from: slice[0]?.t ?? rows[0]?.t,
      to: slice[slice.length - 1]?.t ?? rows[rows.length - 1]?.t,
    };
  }, [range, rows]);

  const empty = rows.every(
    (r) =>
      r.deploys + r.agentRuns + r.risksOpened + r.failedWorkflows === 0,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {(Object.keys(COLORS) as Array<keyof typeof COLORS>).map((k) => (
            <div key={k} className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: COLORS[k] }}
              />
              <span className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
                {LABELS[k]}
              </span>
              <span
                className="font-mt-display text-lg font-semibold tabular-nums"
                style={{ color: COLORS[k] }}
              >
                {totals[k]}
              </span>
            </div>
          ))}
        </div>
        <div className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
          {totals.from && totals.to
            ? `${fmtHour(totals.from)} → ${fmtHour(totals.to)}`
            : "no window"}
        </div>
      </div>

      <div className="h-56 w-full">
        {empty ? (
          <div className="flex h-full items-center justify-center rounded-mt-2 border border-mt-hairline bg-mt-surface-1 font-mt-mono text-xs uppercase tracking-[0.18em] text-mt-text-3">
            No activity in the last 24h
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={rows}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <defs>
                {(Object.keys(COLORS) as Array<keyof typeof COLORS>).map((k) => (
                  <linearGradient
                    key={k}
                    id={`brush-grad-${k}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={COLORS[k]}
                      stopOpacity={0.45}
                    />
                    <stop
                      offset="100%"
                      stopColor={COLORS[k]}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="t"
                tickFormatter={fmtHour}
                axisLine={false}
                tickLine={false}
                stroke="#5D6373"
                tick={{ fontSize: 10, fontFamily: "ui-monospace" }}
                interval="preserveStartEnd"
                minTickGap={32}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                stroke="#5D6373"
                tick={{ fontSize: 10, fontFamily: "ui-monospace" }}
                width={28}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.18)" }}
                contentStyle={{
                  background: "rgba(10, 12, 20, 0.92)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12,
                  backdropFilter: "blur(12px)",
                  fontSize: 12,
                  color: "#F4F6FB",
                }}
                labelFormatter={(t) => fmtHour(Number(t))}
                formatter={(value, name) => [
                  value as number,
                  LABELS[String(name) as keyof typeof COLORS] ?? String(name),
                ]}
              />
              {(Object.keys(COLORS) as Array<keyof typeof COLORS>).map((k) => (
                <Area
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stackId="1"
                  stroke={COLORS[k]}
                  strokeWidth={1.25}
                  fill={`url(#brush-grad-${k})`}
                  animationDuration={600}
                />
              ))}
              <Brush
                dataKey="t"
                height={22}
                stroke="rgba(124,92,255,0.55)"
                fill="rgba(124,92,255,0.06)"
                travellerWidth={8}
                tickFormatter={fmtHour}
                onChange={(r) => {
                  if (
                    typeof r?.startIndex === "number" &&
                    typeof r?.endIndex === "number"
                  ) {
                    setRange([r.startIndex, r.endIndex]);
                  }
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
