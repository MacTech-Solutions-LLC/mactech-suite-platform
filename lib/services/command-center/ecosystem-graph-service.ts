/**
 * Ecosystem graph data — apps as nodes, AppDependency rows as edges,
 * decorated with current health + open risk count for color coding.
 *
 * Read-only. Caller must hold OPS_VIEW (gated at the route + page).
 * Pure read; no audit emission here.
 */

import { prisma } from "@/lib/db/prisma";
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
}

export interface EcosystemGraph {
  nodes: EcosystemNode[];
  edges: EcosystemEdge[];
}

export async function getEcosystemGraph(): Promise<EcosystemGraph> {
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

  const edges: EcosystemEdge[] = deps.map((d) => ({
    id: d.id,
    sourceId: d.sourceAppRegistryId,
    targetId: d.targetAppRegistryId,
    dependencyType: d.dependencyType,
    description: d.description,
    criticality: d.criticality,
  }));

  return { nodes, edges };
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
