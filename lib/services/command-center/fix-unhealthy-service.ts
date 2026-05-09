/**
 * Fix-unhealthy-apps one-click — Sprint 18.
 *
 * Detects apps in the public status / Command Center registry that:
 *   1. Have a latest health snapshot of `degraded` or `down`, or
 *      have no health snapshot at all (unknown), AND
 *   2. Have a `repoFullName` mapped, AND
 *   3. That repo is in the cross-repo agent's allowlist.
 *
 * For each such app, the operator can fire an agent run that asks
 * @claude to add a public anonymous /api/health route. The run is
 * staged in `awaiting_approval` so the operator reviews on
 * /admin/agents before any GitHub issue is filed — same gate as
 * every other agent run.
 */

import { prisma } from "@/lib/db/prisma";
import { isAllowlistedRepo } from "@/lib/agents/cross-repo/policy";

export interface FixableApp {
  appId: string;
  appKey: string;
  name: string;
  repoFullName: string;
  /** What's currently wrong from the operator's perspective. */
  symptom: "down" | "degraded" | "unknown";
  /** What the latest probe URL is so the operator can see "homepage
   *  fallback" vs "real /api/health". */
  healthUrl: string | null;
}

export async function getFixableUnhealthyApps(): Promise<FixableApp[]> {
  // Pull every active app + its latest health snapshot. We do this
  // in JS instead of SQL because the allowlist check is code-defined
  // and shouldn't leak into the database.
  const apps = await prisma.appRegistry.findMany({
    where: { status: "active", repoFullName: { not: null } },
    select: {
      id: true,
      appKey: true,
      name: true,
      repoFullName: true,
      healthUrl: true,
      healthSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  const out: FixableApp[] = [];
  for (const a of apps) {
    if (!a.repoFullName) continue;
    if (!isAllowlistedRepo(a.repoFullName)) continue;
    const latest = a.healthSnapshots[0]?.status ?? "unknown";
    if (latest !== "down" && latest !== "degraded" && latest !== "unknown") {
      continue;
    }
    out.push({
      appId: a.id,
      appKey: a.appKey,
      name: a.name,
      repoFullName: a.repoFullName,
      symptom: latest as "down" | "degraded" | "unknown",
      healthUrl: a.healthUrl,
    });
  }
  return out;
}
