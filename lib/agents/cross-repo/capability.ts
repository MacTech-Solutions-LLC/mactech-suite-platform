/**
 * `open_repo_pull_request` — the cross-repo patch capability (Slice 13).
 *
 * Lives in its own module rather than capabilities/registry.ts because
 * the operation is uniquely high-stakes: it can produce code in any
 * allowlisted MacTech repo. Keeping the implementation file-isolated
 * makes the security-relevant code path obvious to a reviewer.
 *
 * Flow when invoked (already past plan + approval):
 *   1. Pre-flight gates: feature flag, repo allowlist, sane inputs.
 *   2. Resolve default branch HEAD on the target repo.
 *   3. Read 1-N context files (operator-supplied or sensible defaults).
 *   4. Call Anthropic with intent + repo context → CodegenOutput.
 *   5. Validate the proposed patch: branch prefix, path denylist,
 *      total-LOC ceiling. Refuse on any violation.
 *   6. Create branch + commit each file + open PR.
 *   7. Return summary; audit + invariants run from the orchestrator.
 *
 * Defense-in-depth pairings: every check in the capability is also
 * recapitulated as an invariant in cross-repo/invariants.ts. Either
 * layer alone would catch most bugs; together they catch everything
 * the agent could plausibly produce.
 */

import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { crossRepoAgentConfigured } from "@/lib/env";
import {
  createBranch,
  createOrUpdateFile,
  createPullRequest,
  getDefaultBranchHead,
  getFileContent,
} from "@/lib/integrations/github/cross-repo-write";
import { generatePatch } from "@/lib/integrations/anthropic/codegen";
import {
  AGENT_BRANCH_PREFIX,
  AGENT_PR_FOOTER,
  MAX_TOTAL_LINES_PER_PR,
  firstDeniedPath,
  isAllowlistedRepo,
} from "./policy";
import type { Capability, CapabilityResult } from "../types";

const DEFAULT_CONTEXT_PATHS: readonly string[] = ["package.json", "README.md"];

export const open_repo_pull_request: Capability = {
  key: "open_repo_pull_request",
  kind: "approval_required",
  label: "Open a pull request in an allowlisted MacTech repo",
  description:
    "Cross-repo patch agent. Reads 1-N context files from the target repo, asks Claude to generate a patch for the supplied intent, opens a PR. The agent never auto-merges. Refuses unless the repo is in the code-defined allowlist, no denied paths are touched, and total LOC is under the per-PR ceiling. Requires ANTHROPIC_API_KEY + GITHUB_TOKEN + ENABLE_CROSS_REPO_AGENT=true.",
  inputSchema: {
    required: ["repoFullName", "intent"],
    optional: ["contextPaths", "branchSuggestion"],
  },
  requesterPermission: PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE,
  async invoke(input, ctx): Promise<CapabilityResult> {
    await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE);

    if (!crossRepoAgentConfigured()) {
      return refusal(ctx, "agent_not_configured", {
        reason:
          "ENABLE_CROSS_REPO_AGENT, ANTHROPIC_API_KEY, and GITHUB_TOKEN must all be set.",
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
      });
    }

    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      return refusal(ctx, "invalid_repo_full_name", { repoFullName });
    }

    // 1. Default branch HEAD.
    const headRes = await getDefaultBranchHead(owner, repo);
    if (!headRes.ok) {
      return refusal(ctx, "default_branch_lookup_failed", {
        ghReason: headRes.reason,
        ghStatus: headRes.status,
        message: headRes.message,
      });
    }
    const baseBranch = headRes.data.branch;
    const baseSha = headRes.data.sha;

    // 2. Read context files. Missing files are silently skipped — a
    //    repo without a README is fine; we just give Claude less
    //    context. Denied paths in the request are refused explicitly.
    const requestedPaths = Array.isArray(input.contextPaths)
      ? input.contextPaths.filter((p): p is string => typeof p === "string")
      : Array.from(DEFAULT_CONTEXT_PATHS);
    const deniedRequest = firstDeniedPath(requestedPaths);
    if (deniedRequest) {
      return refusal(ctx, "context_path_denied", { ...deniedRequest });
    }
    const repoFiles: Array<{ path: string; content: string }> = [];
    for (const path of requestedPaths) {
      const fileRes = await getFileContent(owner, repo, path, baseBranch);
      if (fileRes.ok) repoFiles.push({ path, content: fileRes.data.content });
      // Silently skip not_found; surface other errors through the run
      // log but continue (one missing file shouldn't block the patch).
    }

    // 3. Anthropic codegen.
    const branchSuggestion =
      typeof input.branchSuggestion === "string" && input.branchSuggestion.trim()
        ? input.branchSuggestion.trim()
        : `${AGENT_BRANCH_PREFIX}${slugify(intent)}-${shortStamp()}`;

    const cg = await generatePatch({
      intent,
      repoFiles,
      repoFullName,
      branchSuggestion,
    });
    if (!cg.ok) {
      return refusal(ctx, `codegen_${cg.reason}`, { message: cg.message });
    }

    // 4. Validate Claude's output. Each rule is also enforced as an
    //    invariant; we check here so we don't make GitHub calls we'll
    //    only have to roll back.
    const out = cg.output;
    if (out.files.length === 0) {
      return refusal(ctx, "codegen_returned_no_files", {
        summary: out.summary,
      });
    }
    const branchName = sanitizeBranch(out.branchName, branchSuggestion);
    const denied = firstDeniedPath(out.files.map((f) => f.path));
    if (denied) return refusal(ctx, "patch_path_denied", { ...denied });
    const totalLines = out.files.reduce(
      (n, f) => n + (f.content.match(/\n/g)?.length ?? 0) + 1,
      0,
    );
    if (totalLines > MAX_TOTAL_LINES_PER_PR) {
      return refusal(ctx, "patch_too_large", {
        totalLines,
        ceiling: MAX_TOTAL_LINES_PER_PR,
      });
    }

    // 5. Create branch.
    const branchRes = await createBranch(owner, repo, branchName, baseSha);
    if (!branchRes.ok) {
      return refusal(ctx, `create_branch_${branchRes.reason}`, {
        ghStatus: branchRes.status,
        message: branchRes.message,
        branchName,
      });
    }

    // 6. Commit each file. We re-read each path on the new branch to
    //    learn whether it exists (for the `sha` field on update). The
    //    branch was just forked from base, so the file state on the
    //    branch == the state on base.
    const commitMessage = (path: string): string =>
      `[mactech-agent] ${out.prTitle.slice(0, 60)} — ${path}`;
    const commits: Array<{ path: string; commitSha: string; action: "create" | "update" }> = [];
    for (const f of out.files) {
      const existing = await getFileContent(owner, repo, f.path, baseBranch);
      const sha = existing.ok ? existing.data.sha : undefined;
      const action: "create" | "update" = sha ? "update" : "create";
      const wrote = await createOrUpdateFile(owner, repo, {
        path: f.path,
        branch: branchName,
        contentUtf8: f.content,
        message: commitMessage(f.path),
        sha,
      });
      if (!wrote.ok) {
        return refusal(ctx, `commit_${wrote.reason}`, {
          path: f.path,
          ghStatus: wrote.status,
          message: wrote.message,
        });
      }
      commits.push({ path: f.path, commitSha: wrote.data.commitSha, action });
    }

    // 7. Open PR.
    const prRes = await createPullRequest(owner, repo, {
      head: branchName,
      base: baseBranch,
      title: out.prTitle,
      body: `${out.prBody}${AGENT_PR_FOOTER}`,
    });
    if (!prRes.ok) {
      return refusal(ctx, `open_pr_${prRes.reason}`, {
        ghStatus: prRes.status,
        message: prRes.message,
      });
    }

    // 8. Audit log + return.
    await writeAuditLog({
      eventType: "agent.capability.invoked",
      eventCategory: "system",
      action: `agent: open_repo_pull_request #${prRes.data.number} (${repoFullName}, run ${ctx.agentRunId})`,
      actorEmail: ctx.requesterEmail,
      resourceType: "github_pull_request",
      resourceId: `${repoFullName}#${prRes.data.number}`,
      metadata: {
        capability: "open_repo_pull_request",
        approverEmail: ctx.approverEmail,
        repoFullName,
        baseBranch,
        branchName,
        prNumber: prRes.data.number,
        htmlUrl: prRes.data.htmlUrl,
        filesChanged: commits.length,
        totalLines,
      },
    });

    return {
      summary: {
        ok: true,
        repoFullName,
        prNumber: prRes.data.number,
        prUrl: prRes.data.htmlUrl,
        branchName,
        baseBranch,
        filesChanged: commits.length,
        totalLines,
        codegenSummary: out.summary,
      },
      artifacts: [
        {
          kind: "markdown",
          title: `PR #${prRes.data.number} — ${out.prTitle}`,
          bodyMarkdown: renderArtifact(repoFullName, out, commits, prRes.data.htmlUrl),
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
    resourceType: "github_pull_request",
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

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "patch"
  );
}

function shortStamp(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Force the branch name into the agent prefix. If the model picked
 *  a non-conforming name, fall back to the suggestion. */
function sanitizeBranch(proposed: string, fallback: string): string {
  const ok = proposed && proposed.startsWith(AGENT_BRANCH_PREFIX) && /^[a-z0-9/_-]+$/i.test(proposed);
  return ok ? proposed : fallback;
}

function renderArtifact(
  repoFullName: string,
  out: { prTitle: string; prBody: string; summary: string; files: Array<{ path: string; rationale: string }> },
  commits: Array<{ path: string; action: "create" | "update" }>,
  prUrl: string,
): string {
  const lines = [
    `# ${out.prTitle}`,
    "",
    `**Repo:** ${repoFullName}`,
    `**PR:** ${prUrl}`,
    "",
    `## Summary`,
    "",
    out.summary,
    "",
    `## Files`,
    "",
    ...commits.map((c, i) => {
      const f = out.files[i];
      return `- \`${c.path}\` (${c.action}) — ${f?.rationale ?? "(no rationale)"}`;
    }),
    "",
    `## PR body`,
    "",
    out.prBody,
  ];
  return lines.join("\n");
}
