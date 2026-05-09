"use client";

import { useMemo, useState } from "react";
import { Boxes, GitBranch } from "lucide-react";
import type { EcosystemEdge, EcosystemNode } from "@/lib/services/command-center/ecosystem-graph-service";

type ViewMode = "apps" | "repos";

interface Props {
  graph: { nodes: EcosystemNode[]; edges: EcosystemEdge[] };
}

interface RepoNode {
  id: string; // repoFullName, doubles as id
  appKey: string; // owner/repo for label
  name: string; // repo basename for the secondary line
  category: string;
  criticality: string;
  lifecycle: string;
  visibility: string;
  publicUrl: string | null; // https://github.com/{repoFullName}
  latestHealth: EcosystemNode["latestHealth"];
  openRiskCount: number;
  hasRailwayMapping: boolean;
  hasRepoMapping: boolean;
  /** Apps backed by this repo. Most repos back exactly one app today
   *  but the model supports many; the visual lists them in the tooltip. */
  appKeys: string[];
}

interface RepoEdge {
  id: string;
  sourceId: string; // repoFullName
  targetId: string; // repoFullName
  dependencyType: EcosystemEdge["dependencyType"];
  description: string | null;
  criticality: string;
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
  const [view, setView] = useState<ViewMode>("apps");

  // Repo-level projection: group apps by repoFullName, dedupe edges
  // whose endpoints collapse to the same repo, drop self-edges.
  const repoView = useMemo(() => projectToRepos(graph), [graph]);

  // Pick the active node/edge set + layout. The structural shape is
  // identical (id, appKey, name, criticality, etc.) so the SVG body
  // doesn't branch on view.
  const activeNodes = view === "apps" ? graph.nodes : repoView.nodes;
  const activeEdges = view === "apps" ? graph.edges : repoView.edges;

  const layout = useMemo(() => buildLayout(activeNodes), [activeNodes]);
  const nodeById = useMemo(
    () => new Map<string, EcosystemNode | RepoNode>(activeNodes.map((n) => [n.id, n])),
    [activeNodes],
  );

  if (graph.nodes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No active apps in the registry. Run the seed or add apps in /admin/app-registry.
      </div>
    );
  }
  if (view === "repos" && repoView.nodes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No apps have a repoFullName set. Edit AppRegistry rows to enable the repo view.
      </div>
    );
  }

  const W = 720;
  const H = 720;
  const NODE_R = view === "repos" ? 44 : 38; // repo labels are longer

  return (
    <div className="rounded-lg border border-border bg-card/30 p-4">
      <ViewToggle
        view={view}
        onChange={setView}
        appCount={graph.nodes.length}
        repoCount={repoView.nodes.length}
      />
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
                <title>{`${edgeEndpointLabel(nodeById.get(e.sourceId), view)} → ${edgeEndpointLabel(nodeById.get(e.targetId), view)}: ${e.dependencyType}${e.description ? ` (${e.description})` : ""}`}</title>
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
                  className={view === "repos" ? "text-[10px]" : "text-[11px]"}
                  fill="hsl(var(--foreground))"
                  style={{ fontWeight: 600 }}
                >
                  {nodeLabel(n, view)}
                </text>
                <text
                  x={p.x}
                  y={p.y + 10}
                  textAnchor="middle"
                  className="text-[9px]"
                  fill="hsl(var(--muted-foreground))"
                >
                  {nodeSublabel(n, view)}
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
                <title>{nodeTitle(n, view)}</title>
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

function nodeTone(n: EcosystemNode | RepoNode): { fill: string; stroke: string } {
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

function buildLayout(
  nodes: ReadonlyArray<EcosystemNode | RepoNode>,
): Map<string, { x: number; y: number }> {
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

// ───────────────────────────────────────────────────────────────────────
// Slice 5.9: repo-level projection
// ───────────────────────────────────────────────────────────────────────

interface RepoProjection {
  nodes: RepoNode[];
  edges: RepoEdge[];
}

/**
 * Project an app-level graph to a repo-level graph: group apps by
 * repoFullName, drop apps without a repo, dedupe edges that collapse
 * to the same repo pair, omit self-edges (same source + target repo).
 */
function projectToRepos(graph: {
  nodes: EcosystemNode[];
  edges: EcosystemEdge[];
}): RepoProjection {
  // Group apps by repoFullName.
  const byRepo = new Map<string, EcosystemNode[]>();
  for (const a of graph.nodes) {
    if (!a.repoFullName) continue;
    const list = byRepo.get(a.repoFullName) ?? [];
    list.push(a);
    byRepo.set(a.repoFullName, list);
  }

  // Build a repo node by taking the worst-of-the-bunch health and the
  // sum of open risks across the apps that share the repo. Criticality
  // is the strongest tier present in the bunch.
  const tierRank: Record<string, number> = {
    mission_critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  const healthRank: Record<string, number> = {
    down: 4,
    degraded: 3,
    unknown: 2,
    up: 1,
  };
  const repoNodes: RepoNode[] = Array.from(byRepo.entries()).map(([fullName, apps]) => {
    const worstHealth = apps.reduce<EcosystemNode["latestHealth"]>((acc, app) => {
      const a = app.latestHealth ?? "unknown";
      const b = acc ?? "unknown";
      return (healthRank[a] ?? 0) >= (healthRank[b] ?? 0)
        ? (a as EcosystemNode["latestHealth"])
        : acc;
    }, null);
    const topTier = apps.reduce<string>((acc, app) => {
      return (tierRank[app.criticality] ?? 0) >= (tierRank[acc] ?? 0)
        ? app.criticality
        : acc;
    }, "low");
    const repoBase = fullName.split("/")[1] ?? fullName;
    return {
      id: fullName,
      appKey: fullName,
      name: repoBase,
      category: apps[0]?.category ?? "service",
      criticality: topTier,
      lifecycle: apps[0]?.lifecycle ?? "production",
      visibility: apps[0]?.visibility ?? "internal",
      publicUrl: `https://github.com/${fullName}`,
      latestHealth: worstHealth,
      openRiskCount: apps.reduce((n, a) => n + a.openRiskCount, 0),
      hasRailwayMapping: apps.some((a) => a.hasRailwayMapping),
      hasRepoMapping: true,
      appKeys: apps.map((a) => a.appKey).sort(),
    };
  });

  // Map each app id → its repoFullName so we can rewrite edges.
  const appIdToRepo = new Map<string, string>();
  for (const a of graph.nodes) {
    if (a.repoFullName) appIdToRepo.set(a.id, a.repoFullName);
  }

  // Dedupe edges by (sourceRepo, targetRepo, dependencyType). Drop
  // self-edges and edges whose endpoints don't have a repo.
  const seen = new Set<string>();
  const repoEdges: RepoEdge[] = [];
  for (const e of graph.edges) {
    const src = appIdToRepo.get(e.sourceId);
    const tgt = appIdToRepo.get(e.targetId);
    if (!src || !tgt) continue;
    if (src === tgt) continue;
    const key = `${src}::${tgt}::${e.dependencyType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    repoEdges.push({
      id: key,
      sourceId: src,
      targetId: tgt,
      dependencyType: e.dependencyType,
      description: e.description,
      criticality: e.criticality,
    });
  }

  return { nodes: repoNodes.sort((a, b) => a.id.localeCompare(b.id)), edges: repoEdges };
}

function nodeLabel(n: EcosystemNode | RepoNode, view: ViewMode): string {
  if (view === "apps") return n.appKey;
  // In repos view, prefer the repo basename for readability.
  return (n as RepoNode).name;
}

function nodeSublabel(n: EcosystemNode | RepoNode, view: ViewMode): string {
  if (view === "apps") {
    return n.criticality === "mission_critical" ? "mission-critical" : n.criticality;
  }
  // Repo sublabel: how many apps live here, plus org segment for context.
  const r = n as RepoNode;
  const owner = r.id.split("/")[0] ?? "";
  if (r.appKeys.length > 1) return `${owner} · ${r.appKeys.length} apps`;
  return owner;
}

function nodeTitle(n: EcosystemNode | RepoNode, view: ViewMode): string {
  if (view === "apps") {
    const a = n as EcosystemNode;
    return `${a.name} · ${a.appKey}\nhealth: ${a.latestHealth ?? "unknown"}\ncriticality: ${a.criticality}\nlifecycle: ${a.lifecycle}\nopen risks: ${a.openRiskCount}`;
  }
  const r = n as RepoNode;
  const apps = r.appKeys.length === 1 ? r.appKeys[0] : `${r.appKeys.length} apps: ${r.appKeys.join(", ")}`;
  return `${r.id}\nbacks ${apps}\nworst health: ${r.latestHealth ?? "unknown"}\ncriticality: ${r.criticality}\nopen risks (sum): ${r.openRiskCount}`;
}

function edgeEndpointLabel(n: EcosystemNode | RepoNode | undefined, view: ViewMode): string {
  if (!n) return "?";
  if (view === "apps") return n.appKey;
  return (n as RepoNode).name;
}

function ViewToggle({
  view,
  onChange,
  appCount,
  repoCount,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
  appCount: number;
  repoCount: number;
}) {
  const Btn = ({
    mode,
    icon: Icon,
    label,
    count,
  }: {
    mode: ViewMode;
    icon: typeof Boxes;
    label: string;
    count: number;
  }) => {
    const active = view === mode;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onChange(mode)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          active
            ? "border-primary bg-primary/15 text-primary"
            : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
        }`}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
        <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
      </button>
    );
  };
  return (
    <div className="mb-3 flex items-center gap-2">
      <Btn mode="apps" icon={Boxes} label="Apps" count={appCount} />
      <Btn mode="repos" icon={GitBranch} label="Repos" count={repoCount} />
      <span className="ml-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        view
      </span>
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
