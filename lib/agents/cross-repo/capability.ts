/**
 * `open_repo_pull_request` — cross-repo agent via Claude Code routine
 * (Slice 13.1).
 *
 * Originally (Slice 13) this capability called Anthropic's API
 * directly, generated a patch, and pushed commits + a PR itself. We
 * pivoted: the Suite now creates a GitHub issue in the target repo
 * with `@claude <intent>` plus ground rules, and the Claude Code
 * GitHub App (installed on the repo) reads the mention, generates
 * the change, and opens the PR. Reasons for the pivot:
 *
 *   - Reuses the Claude Code subscription instead of paying twice
 *     for the same model via the Workbench API.
 *   - Claude Code can iterate (run tests, fix lint) where a single
 *     API call cannot. PR quality is materially higher.
 *   - The PR itself is the gate: human review on GitHub, branch
 *     protection. The Suite's IBE invariants on the *issue* are
 *     enough; what gets merged is determined entirely on GitHub.
 *
 * The capability still owns the safety contract for the *issue*
 * creation step:
 *   - Repo allowlist (code-defined; CROSS_REPO_ALLOWLIST in policy.ts).
 *   - Feature flag (ENABLE_CROSS_REPO_AGENT=true).
 *   - Plan + approval gate from the AgentOps orchestrator.
 *
 * Ground rules sent to Claude Code as text in the issue body:
 *   - branch prefix
 *   - path denylist
 *   - LOC ceiling
 *   - "do not auto-merge"
 * These are advisory (Claude Code respects them by convention) and
 * the human review on the resulting PR is the actual enforcement.
 */

import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { fileClaudeRoutineIssue } from "./claude-routine";
import type { Capability, CapabilityResult } from "../types";

export const open_repo_pull_request: Capability = {
  key: "open_repo_pull_request",
  kind: "approval_required",
  label: "Request a cross-repo PR via Claude Code (@claude routine)",
  description:
    "Files a GitHub issue in an allowlisted MacTech repo with `@claude <intent>` plus the agent's ground rules. The Claude Code GitHub App (installed on the target repo) sees the mention and opens a PR — the Suite never auto-merges. Refuses unless the repo is in the code-defined allowlist and ENABLE_CROSS_REPO_AGENT=true. Requires GITHUB_TOKEN; does NOT call Anthropic directly.",
  inputSchema: {
    required: ["repoFullName", "intent"],
    optional: ["contextHint", "extraGroundRules"],
  },
  requesterPermission: PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE);

    const repoFullName = String(input.repoFullName ?? "").trim();
    const intent = String(input.intent ?? "").trim();
    const contextHint = typeof input.contextHint === "string" ? input.contextHint : "";
    const extraRules = typeof input.extraGroundRules === "string" ? input.extraGroundRules : "";

    const result = await fileClaudeRoutineIssue({
      repoFullName,
      intent,
      contextHint,
      extraRules,
    });
    if (!result.ok) {
      return refusal(ctx, result.reason, { repoFullName, ...(result.detail ?? {}) });
    }

    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: open_repo_pull_request → issue #${result.issueNumber} (${result.repoFullName}, run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "github_issue",
      resourceId: `${result.repoFullName}#${result.issueNumber}`,
      metadata: {
        capability: "open_repo_pull_request",
        approverEmail: ctx.approverEmail,
        repoFullName: result.repoFullName,
        issueNumber: result.issueNumber,
        issueUrl: result.issueUrl,
        delivery: "claude_code_github_app",
      },
    });

    return {
      summary: {
        ok: true,
        repoFullName: result.repoFullName,
        issueNumber: result.issueNumber,
        issueUrl: result.issueUrl,
        intent,
      },
      artifacts: [
        {
          kind: "markdown",
          title: `@claude routine — issue #${result.issueNumber} in ${result.repoFullName}`,
          bodyMarkdown: [
            `# @claude routine filed`,
            "",
            `**Repo:** ${result.repoFullName}`,
            `**Issue:** ${result.issueUrl}`,
            "",
            `Claude Code reads the mention and opens a PR — typically within a few minutes.`,
            `Watch ${`https://github.com/${result.repoFullName}/pulls`} for the PR; review and merge there.`,
            "",
            `## Issue body sent`,
            "",
            result.issueBody,
          ].join("\n"),
        },
      ],
    };
  },
};

interface RefusalCtx {
  agentRunId: string;
  agentStepId: string;
  requesterEmail: string;
  approverEmail: string | null;
}

async function refusal(
  ctx: RefusalCtx,
  reason: string,
  metadata: Record<string, unknown>,
): Promise<CapabilityResult> {
  await writeAuditLog({
    eventType: "agent.capability.refused",
    eventCategory: "system",
    severity: "warning",
    action: `agent: open_repo_pull_request refused (${reason}, run ${ctx.agentRunId})`,
    actorEmail: ctx.requesterEmail,
    resourceType: "github_issue",
    resourceId: typeof metadata.repoFullName === "string" ? metadata.repoFullName : "unknown",
    metadata: {
      capability: "open_repo_pull_request",
      approverEmail: ctx.approverEmail,
      reason,
      ...metadata,
    },
  });
  return { summary: { ok: false, reason, ...metadata } };
}
