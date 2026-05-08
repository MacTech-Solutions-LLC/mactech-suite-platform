"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { EcosystemEdge, EcosystemNode } from "@/lib/services/command-center/ecosystem-graph-service";

interface Props {
  graph: { nodes: EcosystemNode[]; edges: EcosystemEdge[] };
}

/**
 * Pure-SVG ecosystem visualisation. Nodes are placed on a stable
 * concentric layout: mission_critical / high in the inner ring,
 * everything else in the outer ring, sorted alphabetically inside
 * each ring so the layout doesn't shuffle on each refresh.
 *
 * Color coding (per the brief):
 *   green  → up
 *   amber  → degraded / has open risks but otherwise up
 *   red    → down / has open critical risks
 *   gray   → unknown
 *
 * Edges are drawn as straight lines from source to target. The
 * dependencyType is encoded in stroke-dasharray so a glance
 * distinguishes api_calls from auth_provider from evidence_source.
 *
 * Deliberately no D3/cytoscape dependency — keeps the bundle small
 * and the rendering predictable.
 */
export function EcosystemGraph({ graph }: Props) {
  const layout = useMemo(() => buildLayout(graph.nodes), [graph.nodes]);
  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );

  if (graph.nodes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No active apps in the registry. Run the seed or add apps in /admin/app-registry.
      </div>
    );
  }

  const W = 720;
  const H = 720;
  const NODE_R = 38;

  return (
    <div className="rounded-lg border border-border bg-card/30 p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="aspect-square max-h-[720px]"
        role="img"
        aria-label="MacTech ecosystem dependency graph"
      >
        {/* Edges first so nodes paint on top */}
        <g>
          {graph.edges.map((e) => {
            const a = layout.get(e.sourceId);
            const b = layout.get(e.targetId);
            if (!a || !b) return null;
            const dash = DASH_FOR_TYPE[e.dependencyType] ?? "0";
            const stroke =
              e.criticality === "mission_critical"
                ? "hsl(var(--destructive))"
                : e.criticality === "high"
                  ? "hsl(var(--warning))"
                  : "hsl(var(--border))";
            const width = e.criticality === "mission_critical" ? 2 : e.criticality === "high" ? 1.5 : 1;
            return (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={stroke}
                strokeWidth={width}
                strokeDasharray={dash}
                opacity={0.7}
              >
                <title>{`${nodeById.get(e.sourceId)?.appKey} → ${nodeById.get(e.targetId)?.appKey}: ${e.dependencyType}${e.description ? ` (${e.description})` : ""}`}</title>
              </line>
            );
          })}
        </g>
        {/* Nodes */}
        <g>
          {graph.nodes.map((n) => {
            const p = layout.get(n.id);
            if (!p) return null;
            const tone = nodeTone(n);
            return (
              <g key={n.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={NODE_R}
                  fill={tone.fill}
                  stroke={tone.stroke}
                  strokeWidth={n.openRiskCount > 0 ? 2.5 : 1}
                />
                <text
                  x={p.x}
                  y={p.y - 4}
                  textAnchor="middle"
                  className="text-[11px]"
                  fill="hsl(var(--foreground))"
                  style={{ fontWeight: 600 }}
                >
                  {n.appKey}
                </text>
                <text
                  x={p.x}
                  y={p.y + 10}
                  textAnchor="middle"
                  className="text-[9px]"
                  fill="hsl(var(--muted-foreground))"
                >
                  {n.criticality === "mission_critical"
                    ? "mission-critical"
                    : n.criticality}
                </text>
                {n.openRiskCount > 0 ? (
                  <g transform={`translate(${p.x + NODE_R - 8}, ${p.y - NODE_R + 8})`}>
                    <circle r="9" fill="hsl(var(--destructive))" />
                    <text
                      textAnchor="middle"
                      y="4"
                      fill="white"
                      style={{ fontSize: 10, fontWeight: 700 }}
                    >
                      {n.openRiskCount}
                    </text>
                  </g>
                ) : null}
                <title>
                  {`${n.name} · ${n.appKey}\nhealth: ${n.latestHealth ?? "unknown"}\ncriticality: ${n.criticality}\nlifecycle: ${n.lifecycle}\nopen risks: ${n.openRiskCount}`}
                </title>
                {n.publicUrl ? (
                  <a
                    href={n.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${n.name}`}
                  >
                    <rect
                      x={p.x - NODE_R}
                      y={p.y - NODE_R}
                      width={NODE_R * 2}
                      height={NODE_R * 2}
                      fill="transparent"
                    />
                  </a>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <Legend />
        <EdgeLegend />
      </div>
    </div>
  );
}

function nodeTone(n: EcosystemNode): { fill: string; stroke: string } {
  if (n.latestHealth === "down") {
    return { fill: "hsl(var(--destructive) / 0.25)", stroke: "hsl(var(--destructive))" };
  }
  if (n.latestHealth === "degraded" || (n.latestHealth === "up" && n.openRiskCount > 0)) {
    return { fill: "hsl(var(--warning) / 0.25)", stroke: "hsl(var(--warning))" };
  }
  if (n.latestHealth === "up") {
    return { fill: "hsl(var(--success) / 0.25)", stroke: "hsl(var(--success))" };
  }
  return { fill: "hsl(var(--muted))", stroke: "hsl(var(--border))" };
}

const DASH_FOR_TYPE: Partial<Record<EcosystemEdge["dependencyType"], string>> = {
  api_calls: "0",
  auth_provider: "4 4",
  shared_database: "8 4",
  shared_domain: "2 4",
  shared_component: "6 2 2 2",
  content_source: "0",
  evidence_source: "8 2 2 2",
  training_source: "8 2 2 2",
  capture_source: "8 2 2 2",
  governance_source: "8 2 2 2",
  qms_source: "8 2 2 2",
  vault_source: "10 2",
  webhook_source: "1 3",
  other: "3 3",
};

function buildLayout(nodes: EcosystemNode[]): Map<string, { x: number; y: number }> {
  const inner = nodes
    .filter((n) => n.criticality === "mission_critical" || n.criticality === "high")
    .sort((a, b) => a.appKey.localeCompare(b.appKey));
  const outer = nodes
    .filter((n) => !inner.includes(n))
    .sort((a, b) => a.appKey.localeCompare(b.appKey));

  const out = new Map<string, { x: number; y: number }>();
  const cx = 360;
  const cy = 360;
  if (inner.length > 0) {
    const r = 160;
    inner.forEach((n, i) => {
      const angle = (i / inner.length) * Math.PI * 2 - Math.PI / 2;
      out.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });
  }
  if (outer.length > 0) {
    const r = 290;
    outer.forEach((n, i) => {
      const angle = (i / outer.length) * Math.PI * 2 - Math.PI / 2;
      out.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });
  }
  return out;
}

function Legend() {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Health
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-muted-foreground">
        <Swatch tone="success" label="up" />
        <Swatch tone="warning" label="degraded / risk open" />
        <Swatch tone="destructive" label="down" />
        <Swatch tone="muted" label="unknown" />
      </div>
    </div>
  );
}

function Swatch({ tone, label }: { tone: "success" | "warning" | "destructive" | "muted"; label: string }) {
  const fill = {
    success: "hsl(var(--success) / 0.25)",
    warning: "hsl(var(--warning) / 0.25)",
    destructive: "hsl(var(--destructive) / 0.25)",
    muted: "hsl(var(--muted))",
  }[tone];
  const stroke = {
    success: "hsl(var(--success))",
    warning: "hsl(var(--warning))",
    destructive: "hsl(var(--destructive))",
    muted: "hsl(var(--border))",
  }[tone];
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden
        style={{ background: fill, borderColor: stroke }}
        className="inline-block h-3 w-3 rounded-full border"
      />
      {label}
    </div>
  );
}

function EdgeLegend() {
  const items: Array<{ type: string; label: string; dash: string }> = [
    { type: "api_calls", label: "API calls", dash: "0" },
    { type: "auth_provider", label: "Auth provider", dash: "4 4" },
    { type: "shared_database", label: "Shared DB", dash: "8 4" },
    { type: "evidence_source", label: "Evidence / training source", dash: "8 2 2 2" },
    { type: "vault_source", label: "Vault source", dash: "10 2" },
    { type: "webhook_source", label: "Webhook", dash: "1 3" },
  ];
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Edge type
      </div>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {items.map((i) => (
          <li key={i.type} className="flex items-center gap-2">
            <svg width="32" height="6" aria-hidden>
              <line
                x1={0}
                y1={3}
                x2={32}
                y2={3}
                stroke="currentColor"
                strokeDasharray={i.dash}
                strokeWidth={1.5}
              />
            </svg>
            <span>{i.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
