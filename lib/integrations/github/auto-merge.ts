/**
 * GitHub auto-merge enable — Sprint 38.
 *
 * Single-purpose helper for enabling GitHub's native auto-merge on
 * a PR via the GraphQL API. Two-hop: fetch the PR's node_id by
 * (owner, repo, number), then call the enablePullRequestAutoMerge
 * mutation against it.
 *
 * Behavior of GitHub auto-merge:
 *   - If the repo has required status checks / branch protection,
 *     GitHub queues the merge and lands it once everything is green.
 *   - If there are no required checks, the PR is merged immediately
 *     after this mutation.
 *   - If the repo has auto-merge disabled at the repo settings level,
 *     the mutation returns an error (we surface the reason for audit).
 *
 * Used by /api/webhooks/github when a PR opens on a mactech-agent/
 * branch in an allowlisted repo. Crash-fix PRs filed by Claude Code
 * are pre-approved class-of-action; auto-merge replaces the manual
 * "click merge" step.
 */

import { env } from "@/lib/env";

const API_BASE = "https://api.github.com";

export interface AutoMergeOk {
  ok: true;
  pullRequestId: string;
  state: string;
}
export interface AutoMergeFail {
  ok: false;
  reason:
    | "not_configured"
    | "not_found"
    | "graphql_error"
    | "auto_merge_disabled_on_repo"
    | "transient";
  message?: string;
}
export type AutoMergeResult = AutoMergeOk | AutoMergeFail;

export async function enableAutoMergeForPR(
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<AutoMergeResult> {
  const token = env.GITHUB_TOKEN;
  if (!token) return { ok: false, reason: "not_configured" };

  // 1. Resolve the PR's GraphQL node_id.
  const idLookup = await graphql<{
    repository: {
      pullRequest: { id: string; state: string; isInMergeQueue: boolean | null } | null;
    } | null;
  }>(
    token,
    `query($owner: String!, $repo: String!, $num: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $num) {
          id
          state
          isInMergeQueue
        }
      }
    }`,
    { owner, repo, num: pullNumber },
  );
  if (!idLookup.ok) return idLookup;
  const pr = idLookup.data.repository?.pullRequest;
  if (!pr) return { ok: false, reason: "not_found" };

  // 2. Enable native auto-merge with squash strategy. Squash is the
  //    de-facto standard for the MacTech repos (the Suite itself
  //    uses squash for every PR tonight).
  const enable = await graphql<{
    enablePullRequestAutoMerge: {
      pullRequest: { id: string; state: string };
    };
  }>(
    token,
    `mutation($pullId: ID!) {
      enablePullRequestAutoMerge(input: {
        pullRequestId: $pullId,
        mergeMethod: SQUASH
      }) {
        pullRequest { id state }
      }
    }`,
    { pullId: pr.id },
  );
  if (!enable.ok) {
    // GitHub's typical failure message when repo settings forbid
    // auto-merge: "Pull request Auto merge is not allowed for this
    // repository". Translate that into a structured reason so
    // audit + UI can surface a clearer next-step.
    const msg = enable.message ?? "";
    if (/Auto merge.*not allowed/i.test(msg) || /auto-merge.*disabled/i.test(msg)) {
      return { ok: false, reason: "auto_merge_disabled_on_repo", message: msg };
    }
    return enable;
  }

  return {
    ok: true,
    pullRequestId: pr.id,
    state: enable.data.enablePullRequestAutoMerge.pullRequest.state,
  };
}

interface GqlOk<T> {
  ok: true;
  data: T;
}
interface GqlFail {
  ok: false;
  reason: "graphql_error" | "transient";
  message: string;
}
type GqlResult<T> = GqlOk<T> | GqlFail;

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<GqlResult<T>> {
  try {
    const resp = await fetch(`${API_BASE}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        ok: false,
        reason: "transient",
        message: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
      };
    }
    const body = (await resp.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (body.errors && body.errors.length > 0) {
      return {
        ok: false,
        reason: "graphql_error",
        message: body.errors.map((e) => e.message).join("; ").slice(0, 400),
      };
    }
    if (!body.data) {
      return { ok: false, reason: "graphql_error", message: "empty data" };
    }
    return { ok: true, data: body.data };
  } catch (err) {
    return {
      ok: false,
      reason: "transient",
      message: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}
