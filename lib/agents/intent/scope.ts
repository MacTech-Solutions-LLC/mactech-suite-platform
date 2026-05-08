/**
 * Intent scope checker — Slice 5.5.
 *
 * Validates that a planned step's input only references resources the
 * user explicitly admitted into scope. Empty scope arrays mean
 * unbounded (legitimate for fan-out reads like summarize_app_status);
 * non-empty arrays narrow the blast radius to exactly that set.
 *
 * The scope check is the IBE doctrine of "every code change must be
 * tied to a declared scope" applied to runtime effects: if the user
 * said "operate only on apps X and Y", the orchestrator MUST refuse a
 * step whose input.appId names anything outside that.
 */

import { prisma } from "@/lib/db/prisma";

export interface ScopeViolation {
  stepIndex: number;
  capabilityKey: string;
  reason: string;
}

export interface ScopeCheckArgs {
  scopeAppIds: string[];
  scopeRepoIds: string[];
  steps: Array<{
    stepIndex: number;
    capabilityKey: string;
    inputJson: unknown;
  }>;
}

export async function checkScope(args: ScopeCheckArgs): Promise<ScopeViolation[]> {
  const violations: ScopeViolation[] = [];
  const appBound = args.scopeAppIds.length > 0;
  const repoBound = args.scopeRepoIds.length > 0;
  if (!appBound && !repoBound) return violations;

  const appAllowed = new Set(args.scopeAppIds);
  const repoAllowed = new Set(args.scopeRepoIds);

  // Pre-resolve repoFullName → id mapping for any step that names a
  // repoFullName (the planner uses owner/repo strings, but scope is
  // declared as ids). Done once up front so the per-step loop is cheap.
  const fullNamesNeeded = new Set<string>();
  for (const s of args.steps) {
    const input = (s.inputJson ?? {}) as Record<string, unknown>;
    const fn = input.repoFullName;
    if (typeof fn === "string") fullNamesNeeded.add(fn);
  }
  let fullNameToId = new Map<string, string>();
  if (fullNamesNeeded.size > 0 && repoBound) {
    const rows = await prisma.gitRepository.findMany({
      where: { fullName: { in: Array.from(fullNamesNeeded) } },
      select: { id: true, fullName: true },
    });
    fullNameToId = new Map(rows.map((r) => [r.fullName, r.id]));
  }

  for (const step of args.steps) {
    const input = (step.inputJson ?? {}) as Record<string, unknown>;
    const appId = typeof input.appId === "string" ? input.appId : null;
    const repoFullName = typeof input.repoFullName === "string" ? input.repoFullName : null;

    if (appBound && appId && !appAllowed.has(appId)) {
      violations.push({
        stepIndex: step.stepIndex,
        capabilityKey: step.capabilityKey,
        reason: `app id '${appId}' is outside the declared scope`,
      });
    }
    if (repoBound && repoFullName) {
      const id = fullNameToId.get(repoFullName);
      if (!id || !repoAllowed.has(id)) {
        violations.push({
          stepIndex: step.stepIndex,
          capabilityKey: step.capabilityKey,
          reason: `repo '${repoFullName}' is outside the declared scope`,
        });
      }
    }
  }

  return violations;
}
