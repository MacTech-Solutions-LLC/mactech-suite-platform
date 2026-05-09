/**
 * Ecosystem graph data — apps as nodes, AppDependency rows as edges,
 * decorated with current health + open risk count for color coding.
 *
 * Read-only. Caller must hold OPS_VIEW (gated at the route + page).
 * Pure read; no audit emission here.
 */

import { prisma } from "@/lib/db/prisma";
import { getTrafficSummaryByPair } from "./traffic-service";
import type {
  AppDependencyType,
  AppRegistry,
  HealthStatus,
} from "@prisma/client";

export interface EcosystemNode {
  id: string;
  appKey: string;
  name: string;
  category: string;
  criticality: string;
  lifecycle: string;
  visibility: string;
  publicUrl: string | null;
  /** Latest probe outcome — drives node fill. */
  latestHealth: HealthStatus | null;
  /** Open risk count (any category) — drives the warning ring. */
  openRiskCount: number;
  /** Has a Railway mapping — informs ops triage. */
  hasRailwayMapping: boolean;
  /** Has a GitHub repo mapping — same. */
  hasRepoMapping: boolean;
  /** owner/repo if AppRegistry.repoFullName is set; null otherwise.
   *  Slice 5.9 added this so the graph can re-project to a repo-level
   *  view client-side without re-fetching. */
  repoFullName: string | null;
}

export interface EcosystemEdge {
  id: string;
  sourceId: string;
  targetId: string;
  dependencyType: AppDependencyType;
  description: string | null;
  criticality: string;
  /** Slice 6: observed call count over `trafficWindowHours`. 0 if no
   *  AppCallEvent rows exist for this (source, target) pair in the
   *  window. */
  observedCalls: number;
  /** Slice 6: bytes received by the target (sum of bytesIn). */
  observedBytesIn: number;
  /** Slice 6: error-status call count (status >= 400) in the window. */
  observedErrors: number;
  /** Slice 6: most recent observed call in the window, or null. */
  lastSeenAt: Date | null;
}

export interface EcosystemGraph {
  nodes: EcosystemNode[];
  edges: EcosystemEdge[];
  /** Slice 6: hours covered by the traffic aggregates (default 24). */
  trafficWindowHours: number;
}

export async function getEcosystemGraph(
  opts: { trafficWindowHours?: number } = {},
): Promise<EcosystemGraph> {
  const trafficWindowHours = opts.trafficWindowHours ?? 24;
  const apps = await prisma.appRegistry.findMany({
    where: { status: "active" },
    orderBy: [{ criticality: "desc" }, { name: "asc" }],
    include: {
      healthSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { status: true },
      },
      riskFlags: {
        where: { status: "open" },
        select: { id: true },
      },
      railwayResources: {
        where: { active: true },
        select: { id: true },
        take: 1,
      },
    },
  });

  // Map repo presence by AppRegistry.id without joining.
  const linkedAppIds = new Set(
    (await prisma.appRepositoryLink.findMany({ select: { appRegistryId: true } })).map(
      (l) => l.appRegistryId,
    ),
  );

  const nodes: EcosystemNode[] = apps.map((a) => ({
    id: a.id,
    appKey: a.appKey,
    name: a.name,
    category: a.category,
    criticality: a.criticality,
    lifecycle: a.lifecycle,
    visibility: a.visibility,
    publicUrl: a.publicUrl,
    latestHealth: a.healthSnapshots[0]?.status ?? null,
    openRiskCount: a.riskFlags.length,
    hasRailwayMapping: a.railwayResources.length > 0,
    hasRepoMapping: linkedAppIds.has(a.id) || Boolean(a.repoFullName),
    repoFullName: a.repoFullName,
  }));

  const deps = await prisma.appDependency.findMany({
    orderBy: [{ criticality: "desc" }, { dependencyType: "asc" }],
  });

  // Slice 6: pull observed traffic for the same window the caller asked
  // for. Bucket by (source, target) — multiple dependency types between
  // the same pair share the same observed counts since the AppCallEvent
  // row carries no dependency-type semantic.
  const since = new Date(Date.now() - trafficWindowHours * 60 * 60 * 1000);
  const trafficRows = await getTrafficSummaryByPair({ since });
  type Bucket = { calls: number; bytesIn: number; errors: number; lastSeenAt: Date };
  const trafficByPair = new Map<string, Bucket>();
  for (const t of trafficRows) {
    if (!t.sourceAppRegistryId || !t.targetAppRegistryId) continue;
    const key = `${t.sourceAppRegistryId}::${t.targetAppRegistryId}`;
    const existing = trafficByPair.get(key);
    if (existing) {
      existing.calls += t.callCount;
      existing.bytesIn += t.bytesIn;
      existing.errors += t.errorCount;
      if (t.lastSeenAt > existing.lastSeenAt) existing.lastSeenAt = t.lastSeenAt;
    } else {
      trafficByPair.set(key, {
        calls: t.callCount,
        bytesIn: t.bytesIn,
        errors: t.errorCount,
        lastSeenAt: t.lastSeenAt,
      });
    }
  }

  const edges: EcosystemEdge[] = deps.map((d) => {
    const traffic = trafficByPair.get(`${d.sourceAppRegistryId}::${d.targetAppRegistryId}`);
    return {
      id: d.id,
      sourceId: d.sourceAppRegistryId,
      targetId: d.targetAppRegistryId,
      dependencyType: d.dependencyType,
      description: d.description,
      criticality: d.criticality,
      observedCalls: traffic?.calls ?? 0,
      observedBytesIn: traffic?.bytesIn ?? 0,
      observedErrors: traffic?.errors ?? 0,
      lastSeenAt: traffic?.lastSeenAt ?? null,
    };
  });

  return { nodes, edges, trafficWindowHours };
}

// ─── AppDependency CRUD (used by seed; UI defers to a future PR) ─────

export async function listDependencies() {
  return prisma.appDependency.findMany({
    include: {
      source: { select: { appKey: true, name: true } },
      target: { select: { appKey: true, name: true } },
    },
    orderBy: [{ source: { name: "asc" } }, { dependencyType: "asc" }],
  });
}

/**
 * Idempotent upsert of an app dependency edge. Used by the seed.
 * Future AgentOps capability `update_app_dependency` (Slice 5+) wraps
 * this behind agents:approve.
 */
export async function upsertDependency(input: {
  sourceAppKey: string;
  targetAppKey: string;
  dependencyType: AppDependencyType;
  description?: string;
  criticality?: AppRegistry["criticality"];
}) {
  const [src, tgt] = await Promise.all([
    prisma.appRegistry.findUnique({ where: { appKey: input.sourceAppKey }, select: { id: true } }),
    prisma.appRegistry.findUnique({ where: { appKey: input.targetAppKey }, select: { id: true } }),
  ]);
  if (!src || !tgt) return null;
  return prisma.appDependency.upsert({
    where: {
      sourceAppRegistryId_targetAppRegistryId_dependencyType: {
        sourceAppRegistryId: src.id,
        targetAppRegistryId: tgt.id,
        dependencyType: input.dependencyType,
      },
    },
    create: {
      sourceAppRegistryId: src.id,
      targetAppRegistryId: tgt.id,
      dependencyType: input.dependencyType,
      description: input.description ?? null,
      criticality: input.criticality ?? "medium",
    },
    update: {
      description: input.description ?? null,
      criticality: input.criticality ?? "medium",
    },
  });
}
