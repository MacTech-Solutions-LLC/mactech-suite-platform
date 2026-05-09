"use server";

/**
 * Fix-unhealthy-apps server action — Sprint 18.
 *
 * Stages one awaiting_approval AgentRun per fixable app, each with
 * a single `open_repo_pull_request` step pre-bound to ask @claude
 * to add a public anonymous /api/health endpoint to the target
 * repo. Operator reviews + approves on /admin/agents.
 *
 * Why pre-staged runs (not direct execute):
 *   - The orchestrator's separation-of-duties rule (requester !=
 *     approver) means an admin who fires this action must approve
 *     somewhere else. Pre-staging is the natural shape.
 *   - The operator gets to see exactly what's about to happen
 *     before any GitHub issue is filed.
 *   - Mirrors the M2M-trigger-then-approve flow we already use for
 *     the inaugural slice 13.1 runs.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getFixableUnhealthyApps, type FixableApp } from "./fix-unhealthy-service";
import type { Prisma } from "@prisma/client";

export interface FixUnhealthyResult {
  ok: boolean;
  runIds: string[];
  staged: number;
  skipped: number;
  reason?: string;
}

export async function stageFixUnhealthyRuns(): Promise<FixUnhealthyResult> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  const fixable = await getFixableUnhealthyApps();
  if (fixable.length === 0) {
    return { ok: true, runIds: [], staged: 0, skipped: 0, reason: "nothing_to_fix" };
  }

  const runIds: string[] = [];
  let skipped = 0;

  for (const app of fixable) {
    // Skip apps that already have an open agent run targeting their
    // repo for the same intent — avoid duplicate noise.
    const existing = await prisma.agentRun.findFirst({
      where: {
        status: { in: ["awaiting_approval", "approved", "running"] },
        intentScopeAppIds: { has: app.appId },
        intentGoal: { contains: "/api/health" },
      },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const runId = await stageOneRun(ctx.userProfile.email, ctx.userProfile.id, app);
    runIds.push(runId);
  }

  await writeAuditLog({
    eventType: "command_center.fix_unhealthy.staged",
    eventCategory: "system",
    severity: "info",
    action: `Staged ${runIds.length} fix-unhealthy agent run(s) (${skipped} skipped as duplicates)`,
    actorEmail: ctx.userProfile.email,
    actorClerkUserId: ctx.clerkUserId,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "agent_run",
    metadata: {
      runIds,
      stagedAppKeys: fixable.map((a) => a.appKey),
      skipped,
    },
  });

  revalidatePath("/admin/agents");
  revalidatePath("/command-center");

  return { ok: true, runIds, staged: runIds.length, skipped };
}

async function stageOneRun(
  actorEmail: string,
  actorUserProfileId: string,
  app: FixableApp,
): Promise<string> {
  const runId = `run_${cryptoRandom()}`;
  const stepId = `step_${cryptoRandom()}`;

  const inputs: Prisma.InputJsonValue = {
    repoFullName: app.repoFullName,
    intent: `Add a public anonymous /api/health Next.js route that returns JSON {status:"ok", service:"${app.appKey}", timestamp:<ISO-8601>}. The route must NOT be behind Clerk auth — exclude /api/health from middleware.ts public-route matching if needed. Match the repos existing app/ vs pages/ convention.`,
    contextHint:
      "See package.json for framework version, README.md for conventions, middleware.ts for auth gate config. The MacTech Suite probes this endpoint anonymously every reconciliation tick.",
  };

  await prisma.$transaction([
    prisma.agentRun.create({
      data: {
        id: runId,
        status: "awaiting_approval",
        requestText: `One-click fix-unhealthy: add /api/health to ${app.repoFullName}`,
        planSummary: `Stage a @claude routine asking Claude Code to add a public anonymous /api/health endpoint to ${app.repoFullName}. Triggered from /command-center fix-unhealthy banner.`,
        deterministicPlan: true,
        plannedStepCount: 1,
        requiresApproval: true,
        requestedByClerkUserId: `cmd-center:fix-unhealthy:${actorUserProfileId}`,
        requestedByEmail: actorEmail,
        intentGoal: `Create a public anonymous /api/health endpoint in the ${app.appKey} repository.`,
        intentRiskTolerance: "strict",
        intentScopeAppIds: [app.appId],
        intentScopeRepoIds: [],
        intentInvariantsJson: {
          open_repo_pull_request: ["issue_returned", "repo_in_allowlist"],
        },
        intentValidationJson: { valid: true, errors: [] },
      },
    }),
    prisma.agentStep.create({
      data: {
        id: stepId,
        agentRunId: runId,
        stepIndex: 1,
        capabilityKey: "open_repo_pull_request",
        kind: "approval_required",
        rationale: `One-click fix-unhealthy: file @claude routine to add /api/health to ${app.repoFullName} (symptom: ${app.symptom}).`,
        inputJson: inputs,
        status: "planned",
      },
    }),
  ]);

  return runId;
}

function cryptoRandom(): string {
  // Server-only: 24-byte hex (matches the existing run/step id shape
  // used by the orchestrator).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(16).toString("hex");
}
