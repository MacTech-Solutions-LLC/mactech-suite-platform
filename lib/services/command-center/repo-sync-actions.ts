"use server";

/**
 * Per-repo sync server action — Sprint 28.
 *
 * One-click "Sync now" wrapper around syncRepositoryByFullName for
 * the /admin/repositories row UI. Distinct from the existing
 * Command-Center-wide /api/command-center/sync (which probes every
 * app's health URL and reconciles risks); this is just the GitHub
 * pull for one repo so an operator can refresh a single tile when
 * a webhook delivery dropped.
 */

import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/authz";
import { syncRepositoryByFullName } from "./github-sync-service";

export interface RepoSyncResult {
  ok: boolean;
  reason?: string;
  commitsInserted?: number;
  workflowRunsUpserted?: number;
  warnings?: string[];
}

export async function syncRepoNow(fullName: string): Promise<RepoSyncResult> {
  const ctx = await requireAuthContext();
  try {
    const result = await syncRepositoryByFullName(ctx, fullName);
    if (!result) return { ok: false, reason: "no_result" };
    revalidatePath("/admin/repositories");
    revalidatePath("/admin/repositories/commits");
    revalidatePath("/admin/repositories/workflow-runs");
    return {
      ok: true,
      commitsInserted: result.commitsInserted,
      workflowRunsUpserted: result.workflowRunsUpserted,
      warnings: result.warnings,
    };
  } catch (err) {
    if (err instanceof Error) return { ok: false, reason: err.message };
    return { ok: false, reason: "sync_failed" };
  }
}
