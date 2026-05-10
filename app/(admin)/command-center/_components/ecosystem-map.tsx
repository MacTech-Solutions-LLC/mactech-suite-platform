/**
 * Sprint 47 — Ecosystem Map (Vivid /command-center centerpiece).
 *
 * Server-rendered SVG of the App Registry as a radial constellation:
 * a "Suite" core in the center, every active app on a ring, each
 * node colored by criticality and pulse-styled by latest health
 * status. Edges run from the core to each node.
 *
 * Variants on the ring layout:
 *   - critical / high apps land on the inner ring (closer = more
 *     blast-radius if they fall over).
 *   - medium / low / experimental land on the outer ring.
 *   - within each ring we sort alphabetically by name so the layout
 *     is deterministic across renders.
 *
 * Hover affordance is purely CSS — each node + its label is a <g>
 * with a sibling <title>, so the browser's native tooltip surfaces
 * appKey/status without any client JS.
 */

import Link from "next/link";
import type { AppOperationalSnapshot } from "@/lib/services/command-center/command-center-service";

interface Props {
  snapshots: AppOperationalSnapshot[];
  /** Maximum height in CSS pixels — width fills its container. */
  height?: number;
}

const VIEW_W = 1000;
const VIEW_H = 540;
const CENTER = { x: VIEW_W / 2, y: VIEW_H / 2 };

const CRITICALITY_COLOR: Record<string, string> = {
  mission_critical: "#FF6679",
  high: "#FFB454",
  medium: "#00E5FF",
  low: "#7C5CFF",
};

const CRITICALITY_LABEL: Record<string, string> = {
  mission_critical: "mission-critical",
  high: "high",
  medium: "medium",
  low: "low",
};

const HEALTH_COLOR: Record<string, string> = {
  up: "#B6FF6E",
  degraded: "#FFB454",
  down: "#FF6679",
  unknown: "#5D6373",
};

export function EcosystemMap({ snapshots, height = 460 }: Props) {
  const inner = snapshots
    .filter(
      (s) =>
        s.app.criticality === "mission_critical" || s.app.criticality === "high",
    )
    .sort((a, b) => a.app.name.localeCompare(b.app.name));
  const outer = snapshots
    .filter(
      (s) =>
        s.app.criticality !== "mission_critical" && s.app.criticality !== "high",
    )
    .sort((a, b) => a.app.name.localeCompare(b.app.name));

  const innerR = 150;
  const outerR = 240;

  const nodes = [
    ...inner.map((s, i) => ({ snap: s, ring: "inner" as const, ...polar(i, inner.length, innerR) })),
    ...outer.map((s, i) => ({ snap: s, ring: "outer" as const, ...polar(i, outer.length, outerR) })),
  ];

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label={`Ecosystem map of ${snapshots.length} apps`}
      >
        <defs>
          {/* Soft cyan glow for the core. */}
          <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0, 229, 255, 0.55)" />
            <stop offset="60%" stopColor="rgba(124, 92, 255, 0.18)" />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
          </radialGradient>
          {/* Edge gradient: faint at center → accent at node. */}
          <linearGradient id="edge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="100%" stopColor="rgba(0,229,255,0.55)" />
          </linearGradient>
          <filter id="node-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Concentric ring guides — very faint. */}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={innerR}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeDasharray="2 4"
        />
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={outerR}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeDasharray="2 4"
        />

        {/* Edges from center to each node. */}
        {nodes.map((n) => (
          <line
            key={`edge-${n.snap.app.appKey}`}
            x1={CENTER.x}
            y1={CENTER.y}
            x2={n.x}
            y2={n.y}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={1}
          />
        ))}

        {/* Core glow. */}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={68}
          fill="url(#core-glow)"
          filter="url(#node-blur)"
        />
        {/* Core ring + label. */}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={32}
          fill="rgba(10, 12, 20, 0.85)"
          stroke="rgba(0,229,255,0.55)"
          strokeWidth={1.5}
        />
        <text
          x={CENTER.x}
          y={CENTER.y - 2}
          textAnchor="middle"
          fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
          fontSize={9}
          fill="#8C93A4"
          letterSpacing={2}
          style={{ textTransform: "uppercase" }}
        >
          MACTECH
        </text>
        <text
          x={CENTER.x}
          y={CENTER.y + 11}
          textAnchor="middle"
          fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
          fontSize={9}
          fill="#F4F6FB"
          letterSpacing={2}
          style={{ textTransform: "uppercase" }}
        >
          SUITE
        </text>

        {/* Nodes. */}
        {nodes.map((n) => {
          const status = n.snap.latestHealth?.status ?? "unknown";
          const critColor = CRITICALITY_COLOR[n.snap.app.criticality] ?? "#7C5CFF";
          const healthColor = HEALTH_COLOR[status] ?? HEALTH_COLOR.unknown;
          const showAlert = status === "down" || status === "degraded";
          const labelOnRight = n.x >= CENTER.x;
          return (
            <g key={`node-${n.snap.app.appKey}`}>
              <title>
                {n.snap.app.name} ·{" "}
                {CRITICALITY_LABEL[n.snap.app.criticality] ?? n.snap.app.criticality}
                {" · "}
                {status}
                {n.snap.openRisks.length > 0
                  ? ` · ${n.snap.openRisks.length} open risk(s)`
                  : ""}
              </title>
              {/* Health pulse ring (only when degraded/down). */}
              {showAlert ? (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={14}
                  fill="none"
                  stroke={healthColor}
                  strokeWidth={1.25}
                  opacity={0.8}
                  className="origin-center animate-mt-pulse-glow"
                />
              ) : null}
              {/* Outer glow disk in criticality color. */}
              <circle
                cx={n.x}
                cy={n.y}
                r={10}
                fill={critColor}
                opacity={0.18}
                filter="url(#node-blur)"
              />
              {/* Solid node — health color outline + criticality fill. */}
              <circle
                cx={n.x}
                cy={n.y}
                r={6.5}
                fill={critColor}
                stroke={healthColor}
                strokeWidth={1.5}
              />
              {/* Label. */}
              <text
                x={n.x + (labelOnRight ? 12 : -12)}
                y={n.y + 4}
                textAnchor={labelOnRight ? "start" : "end"}
                fontFamily="ui-sans-serif,system-ui,sans-serif"
                fontSize={11}
                fill="#C8CEDB"
              >
                {n.snap.app.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend overlay — corner. */}
      <ul
        className="pointer-events-none absolute bottom-2 right-2 hidden gap-1 rounded-mt-1 border border-mt-hairline bg-mt-bg-2/80 px-2 py-1.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] text-mt-text-3 backdrop-blur md:flex md:flex-col"
        aria-hidden
      >
        <li className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: CRITICALITY_COLOR.mission_critical }}
          />
          mission-critical
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: CRITICALITY_COLOR.high }}
          />
          high
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: CRITICALITY_COLOR.medium }} />
          medium
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: CRITICALITY_COLOR.low }} />
          low
        </li>
      </ul>

      {/* Click overlay — give each app a deep link. SVG <a> works,
          but stacking an absolute-positioned grid of links keeps
          the click target generous (8px around each label). */}
      <div className="pointer-events-none absolute inset-0">
        {nodes.map((n) => {
          const cx = (n.x / VIEW_W) * 100;
          const cy = (n.y / VIEW_H) * 100;
          return (
            <Link
              key={`hit-${n.snap.app.appKey}`}
              href={`/admin/apps/${n.snap.app.appKey}`}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-1 py-0.5 text-[0px] outline-none focus-visible:ring-2 focus-visible:ring-mt-cyan"
              style={{ left: `${cx}%`, top: `${cy}%` }}
              aria-label={`Open ${n.snap.app.name}`}
            >
              <span className="block h-5 w-5 rounded-full" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function polar(i: number, total: number, r: number) {
  // Start at 12 o'clock and walk clockwise; angles in radians.
  const angle = total === 0 ? 0 : (i / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTER.x + Math.cos(angle) * r,
    y: CENTER.y + Math.sin(angle) * r,
  };
}
