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
import { crossRepoAgentConfigured } from "@/lib/env";
import { getGitHubClient } from "@/lib/integrations/github/client";
import {
  AGENT_BRANCH_PREFIX,
  AGENT_PR_FOOTER,
  CROSS_REPO_ALLOWLIST,
  MAX_TOTAL_LINES_PER_PR,
  isAllowlistedRepo,
} from "./policy";
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

    if (!crossRepoAgentConfigured()) {
      return refusal(ctx, "agent_not_configured", {
        reason:
          "ENABLE_CROSS_REPO_AGENT and GITHUB_TOKEN must both be set on the Suite Railway service.",
      });
    }

    const repoFullName = String(input.repoFullName ?? "").trim();
    const intent = String(input.intent ?? "").trim();
    if (!repoFullName || !intent) {
      return refusal(ctx, "invalid_input", {
        reason: "repoFullName and intent are both required.",
      });
    }
    if (!isAllowlistedRepo(repoFullName)) {
      return refusal(ctx, "repo_not_allowlisted", {
        reason: `${repoFullName} is not in CROSS_REPO_ALLOWLIST. Add it to lib/agents/cross-repo/policy.ts and re-deploy.`,
        allowlist: [...CROSS_REPO_ALLOWLIST],
      });
    }

    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      return refusal(ctx, "invalid_repo_full_name", { repoFullName });
    }

    const gh = getGitHubClient();
    if (!gh.configured) {
      return refusal(ctx, "github_not_configured", {
        reason: "GITHUB_TOKEN missing or ENABLE_GITHUB_SYNC=false.",
      });
    }

    const contextHint = typeof input.contextHint === "string" ? input.contextHint.trim() : "";
    const extraRules = typeof input.extraGroundRules === "string" ? input.extraGroundRules.trim() : "";
    const issueBody = renderIssueBody({ intent, contextHint, extraRules });
    const issueTitle = `[mactech-agent] ${truncate(intent.split("\n")[0]!, 60)}`;

    const result = await gh.createIssue(owner, repo, {
      title: issueTitle,
      body: issueBody,
      labels: ["mactech-agent", "automation"],
    });
    if (!result.ok) {
      return refusal(ctx, `create_issue_${result.reason}`, {
        repoFullName,
        ghStatus: result.status,
      });
    }

    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: open_repo_pull_request → issue #${result.data.number} (${repoFullName}, run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "github_issue",
      resourceId: `${repoFullName}#${result.data.number}`,
      metadata: {
        capability: "open_repo_pull_request",
        approverEmail: ctx.approverEmail,
        repoFullName,
        issueNumber: result.data.number,
        issueUrl: result.data.htmlUrl,
        delivery: "claude_code_github_app",
      },
    });

    return {
      summary: {
        ok: true,
        repoFullName,
        issueNumber: result.data.number,
        issueUrl: result.data.htmlUrl,
        intent,
      },
      artifacts: [
        {
          kind: "markdown",
          title: `@claude routine — issue #${result.data.number} in ${repoFullName}`,
          bodyMarkdown: [
            `# @claude routine filed`,
            "",
            `**Repo:** ${repoFullName}`,
            `**Issue:** ${result.data.htmlUrl}`,
            "",
            `Claude Code reads the mention and opens a PR — typically within a few minutes.`,
            `Watch ${`https://github.com/${repoFullName}/pulls`} for the PR; review and merge there.`,
            "",
            `## Issue body sent`,
            "",
            issueBody,
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

function renderIssueBody(args: {
  intent: string;
  contextHint: string;
  extraRules: string;
}): string {
  const parts: string[] = [
    `@claude ${args.intent}`,
    "",
  ];
  if (args.contextHint) {
    parts.push("## Context for this change", "", args.contextHint, "");
  }
  parts.push(
    "## Ground rules (MacTech Suite cross-repo agent)",
    "",
    `- Branch prefix: \`${AGENT_BRANCH_PREFIX}\` (e.g. \`${AGENT_BRANCH_PREFIX}fix-health-route\`).`,
    `- Keep total lines of new/modified code under **${MAX_TOTAL_LINES_PER_PR}**. Split into multiple PRs if larger.`,
    `- **Do NOT modify**: lockfiles (\`package-lock.json\`, \`yarn.lock\`, \`pnpm-lock.yaml\`, \`bun.lockb\`), \`.env*\` files, \`.github/workflows/*\`, \`Dockerfile\`, \`railway.toml\`, \`nixpacks.toml\`, \`middleware.ts\`, any \`.pem\` / \`.key\` / \`.tf\` files.`,
    `- **Do NOT auto-merge.** Open the PR; a human at MacTech Solutions reviews and merges.`,
    `- Match the existing repo's framework conventions (Next.js \`app/\` vs \`pages/\`, file casing, lint config).`,
    `- Keep the PR description concise: what + why + how to verify.`,
    "",
  );
  if (args.extraRules) {
    parts.push("## Additional rules", "", args.extraRules, "");
  }
  parts.push(AGENT_PR_FOOTER.trim());
  return parts.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
