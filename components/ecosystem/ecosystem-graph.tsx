"use client";

import { useMemo, useState } from "react";
import { Boxes, GitBranch } from "lucide-react";
import type { EcosystemEdge, EcosystemNode } from "@/lib/services/command-center/ecosystem-graph-service";

type ViewMode = "apps" | "repos";

interface Props {
  graph: {
    nodes: EcosystemNode[];
    edges: EcosystemEdge[];
    trafficWindowHours?: number;
  };
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
          {(view === "apps" ? graph.edges : repoView.edges).map((e) => {
            const a = layout.get(e.sourceId);
            const b = layout.get(e.targetId);
            if (!a || !b) return null;
            const dash = DASH_FOR_TYPE[e.dependencyType] ?? "0";
            // Observed traffic in apps view comes from the underlying
            // AppDependency edges; in repos view we need to look up the
            // collapsed counts.
            const observed =
              view === "apps"
                ? {
                    calls: (e as EcosystemEdge).observedCalls ?? 0,
                    errors: (e as EcosystemEdge).observedErrors ?? 0,
                    bytes: (e as EcosystemEdge).observedBytesIn ?? 0,
                    lastSeenAt: (e as EcosystemEdge).lastSeenAt ?? null,
                  }
                : (repoView.observedByPair.get(`${e.sourceId}::${e.targetId}`) ?? {
                    calls: 0,
                    errors: 0,
                    bytes: 0,
                    lastSeenAt: null,
                  });
            const hasTraffic = observed.calls > 0;
            const isErroring = observed.errors > 0;
            // Stroke color: errors > criticality > default. Errors in
            // observed traffic outrank declared criticality in v1; the
            // operator wants to see "this edge is broken right now".
            const stroke = isErroring
              ? "hsl(var(--destructive))"
              : e.criticality === "mission_critical"
                ? "hsl(var(--destructive))"
                : e.criticality === "high"
                  ? "hsl(var(--warning))"
                  : hasTraffic
                    ? "hsl(var(--success))"
                    : "hsl(var(--border))";
            // Stroke width: declared criticality is the floor; observed
            // traffic on top of that bumps the line up to a max of 3.5.
            const baseWidth =
              e.criticality === "mission_critical" ? 2 : e.criticality === "high" ? 1.5 : 1;
            const trafficBoost = hasTraffic
              ? Math.min(1.5, Math.log10(observed.calls + 1) * 0.7)
              : 0;
            const width = baseWidth + trafficBoost;
            const eHref = edgeHref(
              nodeById.get(e.sourceId),
              nodeById.get(e.targetId),
            );
            const lineEl = (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={stroke}
                strokeWidth={width}
                strokeDasharray={dash}
                opacity={hasTraffic ? 0.85 : 0.55}
                style={eHref ? { cursor: "pointer" } : undefined}
              >
                <title>
                  {edgeTooltip(
                    nodeById.get(e.sourceId),
                    nodeById.get(e.targetId),
                    e,
                    observed,
                    view,
                    graph.trafficWindowHours ?? 24,
                  )}
                </title>
              </line>
            );
            // Sprint 30: clicking an edge drills into traffic
            // filtered by that pair. SVG hit-testing on a thin
            // line is finicky; the title still fires for hover.
            return eHref ? (
              <a key={e.id} href={eHref} aria-label="Drill into edge traffic">
                {lineEl}
              </a>
            ) : (
              lineEl
            );
          })}
        </g>
        {/* Nodes */}
        <g>
          {activeNodes.map((n) => {
            const p = layout.get(n.id);
            if (!p) return null;
            const tone = nodeTone(n);
            const isExternal =
              "isExternal" in n && (n as EcosystemNode).isExternal === true;
            return (
              <g key={n.id}>
                {isExternal ? (
                  // External services render as a rounded rect to be
                  // instantly distinguishable from app circles. No
                  // health ring (we don't probe their health).
                  <rect
                    x={p.x - NODE_R}
                    y={p.y - NODE_R * 0.7}
                    width={NODE_R * 2}
                    height={NODE_R * 1.4}
                    rx={6}
                    ry={6}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                ) : (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={NODE_R}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={n.openRiskCount > 0 ? 2.5 : 1}
                  />
                )}
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
                {/* Sprint 30: clickable nodes drill into the per-app
                    investigate page (or repo commits in repo view).
                    External services link to traffic filtered by
                    target label so the operator can see what's
                    actually flowing. */}
                {nodeHref(n, view) ? (
                  <a
                    href={nodeHref(n, view)!}
                    aria-label={`Drill into ${n.name}`}
                  >
                    <rect
                      x={p.x - NODE_R}
                      y={p.y - NODE_R}
                      width={NODE_R * 2}
                      height={NODE_R * 2}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
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

/**
 * Sprint 30: where does clicking this node take you?
 *
 *   - Apps view, internal app           → /admin/apps/<appKey>
 *   - Apps view, external service       → /admin/ops/traffic filtered
 *                                          by toLabel (the service slug)
 *   - Repos view, repo with apps        → /admin/repositories/commits
 *                                          filtered by appId of the
 *                                          first app it backs (the
 *                                          per-app page is richer
 *                                          than the repo list).
 *   - Repos view, external service      → no drill (matches apps view)
 */
function nodeHref(n: EcosystemNode | RepoNode, view: ViewMode): string | null {
  const isExternal =
    "isExternal" in n && (n as EcosystemNode).isExternal === true;
  if (isExternal) {
    // External services: filter traffic to the synthetic label.
    // EcosystemNode.appKey holds the canonical label for externals
    // (e.g. "github", "openai") in the service projection.
    return `/admin/ops/traffic?toLabel=${encodeURIComponent((n as EcosystemNode).appKey)}`;
  }
  if (view === "apps") {
    return `/admin/apps/${(n as EcosystemNode).appKey}`;
  }
  // Repos view: send to the commit feed for the first backing app, if
  // any. RepoNode carries appKeys[]; if there are none, no drill.
  const repoNode = n as RepoNode;
  if (repoNode.appKeys.length > 0) {
    return `/admin/apps/${repoNode.appKeys[0]}`;
  }
  return null;
}

/**
 * Sprint 30: where does clicking this edge take you?
 *
 *   - app → app: /admin/ops/traffic?from=<src.appKey>&to=<dst.id>
 *   - app → external: /admin/ops/traffic?from=<src.appKey>&toLabel=<dst.appKey>
 *   - external → app: /admin/ops/traffic?from=<src.appKey>&to=<dst.id>
 */
function edgeHref(
  source: EcosystemNode | RepoNode | undefined,
  target: EcosystemNode | RepoNode | undefined,
): string | null {
  if (!source || !target) return null;
  const params = new URLSearchParams();
  // sourceLabel filter accepts either an internal appKey or an
  // external label like "github" — both go into ?from=.
  params.set("from", source.appKey);
  const targetIsExternal =
    "isExternal" in target && (target as EcosystemNode).isExternal === true;
  if (targetIsExternal) {
    params.set("toLabel", (target as EcosystemNode).appKey);
  } else {
    params.set("to", (target as EcosystemNode).id);
  }
  return `/admin/ops/traffic?${params.toString()}`;
}

function nodeTone(n: EcosystemNode | RepoNode): { fill: string; stroke: string } {
  // External services don't have a probed health; tone them muted so
  // they read as "third party, not part of our health story".
  if ("isExternal" in n && (n as EcosystemNode).isExternal === true) {
    return {
      fill: "hsl(var(--muted) / 0.5)",
      stroke: "hsl(var(--muted-foreground))",
    };
  }
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
  /** Slice 6: observed traffic collapsed by repo pair, keyed
   *  `${sourceRepo}::${targetRepo}`. */
  observedByPair: Map<
    string,
    { calls: number; errors: number; bytes: number; lastSeenAt: Date | null }
  >;
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
  // Group apps by repoFullName. Skip synthetic external nodes — they
  // aren't repos, they're services Suite calls. Repo view stays
  // focused on what's in our git tree.
  const byRepo = new Map<string, EcosystemNode[]>();
  for (const a of graph.nodes) {
    if (a.isExternal) continue;
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
  // self-edges and edges whose endpoints don't have a repo. Collapse
  // observed traffic by (sourceRepo, targetRepo) — multiple
  // dependency-type rows between the same repo pair share counts.
  const seen = new Set<string>();
  const repoEdges: RepoEdge[] = [];
  const observedByPair = new Map<
    string,
    { calls: number; errors: number; bytes: number; lastSeenAt: Date | null }
  >();
  for (const e of graph.edges) {
    const src = appIdToRepo.get(e.sourceId);
    const tgt = appIdToRepo.get(e.targetId);
    if (!src || !tgt) continue;
    if (src === tgt) continue;
    const pairKey = `${src}::${tgt}`;
    const calls = e.observedCalls ?? 0;
    const errors = e.observedErrors ?? 0;
    const bytes = e.observedBytesIn ?? 0;
    const lastSeen = e.lastSeenAt ?? null;
    const existing = observedByPair.get(pairKey);
    if (existing) {
      existing.calls += calls;
      existing.errors += errors;
      existing.bytes += bytes;
      if (lastSeen && (!existing.lastSeenAt || lastSeen > existing.lastSeenAt)) {
        existing.lastSeenAt = lastSeen;
      }
    } else {
      observedByPair.set(pairKey, {
        calls,
        errors,
        bytes,
        lastSeenAt: lastSeen,
      });
    }
    const edgeKey = `${src}::${tgt}::${e.dependencyType}`;
    if (seen.has(edgeKey)) continue;
    seen.add(edgeKey);
    repoEdges.push({
      id: edgeKey,
      sourceId: src,
      targetId: tgt,
      dependencyType: e.dependencyType,
      description: e.description,
      criticality: e.criticality,
    });
  }

  return {
    nodes: repoNodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: repoEdges,
    observedByPair,
  };
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

/**
 * Slice 6: tooltip for an edge — declared dependency line + observed
 * traffic line if any calls landed in the configured window. Edges
 * with zero observed calls just show the declared description, same
 * shape as the slice-5.9 tooltip.
 */
function edgeTooltip(
  source: EcosystemNode | RepoNode | undefined,
  target: EcosystemNode | RepoNode | undefined,
  edge: { dependencyType: string; description: string | null },
  observed: { calls: number; errors: number; bytes: number; lastSeenAt: Date | null },
  view: ViewMode,
  windowHours: number,
): string {
  const head = `${edgeEndpointLabel(source, view)} → ${edgeEndpointLabel(target, view)}`;
  const decl = `${edge.dependencyType}${edge.description ? ` (${edge.description})` : ""}`;
  if (observed.calls === 0) return `${head}: ${decl}`;
  const errs = observed.errors > 0 ? `, ${observed.errors} error${observed.errors === 1 ? "" : "s"}` : "";
  const bytes =
    observed.bytes > 0
      ? `, ${formatBytes(observed.bytes)} in`
      : "";
  const last = observed.lastSeenAt
    ? `, last ${observed.lastSeenAt.toLocaleTimeString()}`
    : "";
  return `${head}: ${decl}\n${observed.calls} call${observed.calls === 1 ? "" : "s"} (${windowHours}h)${errs}${bytes}${last}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
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
