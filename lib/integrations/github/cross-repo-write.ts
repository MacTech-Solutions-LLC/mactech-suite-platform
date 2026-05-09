/**
 * GitHub write client for the cross-repo patch agent — Slice 13.
 *
 * Lives in a separate module from the read-mostly GitHub client so
 * that:
 *   - The capabilities that ONLY need read access can keep importing
 *     `getGitHubClient()` and never see these write methods.
 *   - A reviewer auditing "what code can open PRs in MacTech repos?"
 *     has exactly one file to read.
 *
 * All methods are token-isolated to GITHUB_TOKEN (same env var the
 * read client uses; the GH App or PAT has the same scopes for both
 * surfaces). Each method records an outbound traffic event so
 * /admin/ops/traffic can show the agent's GitHub call rate.
 *
 * Failure modes are returned as discriminated unions so the
 * capability layer can surface the reason in the AgentRun row.
 */

import { env } from "@/lib/env";

const API_BASE = "https://api.github.com";

export interface GhWriteOk<T> {
  ok: true;
  data: T;
}
export interface GhWriteFail {
  ok: false;
  reason:
    | "not_configured"
    | "unauthorized"
    | "not_found"
    | "validation_failed"
    | "branch_exists"
    | "transient";
  status: number;
  message?: string;
}
export type GhWriteResult<T> = GhWriteOk<T> | GhWriteFail;

interface ReqInit {
  method: "GET" | "POST" | "PUT";
  body?: string;
  timeoutMs?: number;
}

async function call<T>(
  path: string,
  init: ReqInit,
  trafficEndpoint: string,
): Promise<GhWriteResult<T>> {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, reason: "not_configured", status: 0 };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 12_000);
  const startedAt = Date.now();
  let statusForTraffic = 0;
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: init.method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "MacTechCommandCenter-CrossRepoAgent/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: init.body,
      signal: controller.signal,
      cache: "no-store",
    });
    statusForTraffic = resp.status;
    if (resp.status === 401) return { ok: false, reason: "unauthorized", status: 401 };
    if (resp.status === 404) return { ok: false, reason: "not_found", status: 404 };
    if (resp.status === 422) {
      // Common: branch already exists (POST /git/refs returns 422 with
      // "Reference already exists"). Surface that distinctly so the
      // capability can pick a new branch name and retry.
      const text = await resp.text();
      if (/Reference already exists/i.test(text)) {
        return { ok: false, reason: "branch_exists", status: 422, message: text.slice(0, 200) };
      }
      return { ok: false, reason: "validation_failed", status: 422, message: text.slice(0, 200) };
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, reason: "transient", status: resp.status, message: text.slice(0, 200) };
    }
    const data = (await resp.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      reason: "transient",
      status: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
    try {
      const { recordOutboundCall } = await import(
        "@/lib/services/command-center/traffic-service"
      );
      void recordOutboundCall({
        targetLabel: "github",
        endpoint: trafficEndpoint,
        method: init.method,
        statusCode: statusForTraffic || 0,
        bytesOut: init.body?.length ?? 0,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      /* observability never blocks */
    }
  }
}

/**
 * Resolve the default-branch HEAD for a repo. Two API calls: GET /repos
 * to learn the default-branch name, then GET /git/ref/heads/:branch
 * to get its SHA.
 */
export async function getDefaultBranchHead(
  owner: string,
  repo: string,
): Promise<GhWriteResult<{ branch: string; sha: string }>> {
  const repoRes = await call<{ default_branch: string }>(
    `/repos/${owner}/${repo}`,
    { method: "GET" },
    `github:/repos/${owner}/${repo}:default_branch`,
  );
  if (!repoRes.ok) return repoRes;
  const branch = repoRes.data.default_branch;
  const refRes = await call<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    { method: "GET" },
    `github:/repos/${owner}/${repo}/git/ref:head`,
  );
  if (!refRes.ok) return refRes;
  return { ok: true, data: { branch, sha: refRes.data.object.sha } };
}

/**
 * Read a single file's content. Returns the decoded text content and
 * the file's SHA (needed if we want to update it later). 404 surfaces
 * as `not_found` so the agent can choose to create the file instead.
 */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<GhWriteResult<{ content: string; sha: string }>> {
  const qs = new URLSearchParams({ ref });
  const res = await call<{ content: string; encoding: string; sha: string }>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?${qs.toString()}`,
    { method: "GET" },
    `github:/repos/${owner}/${repo}/contents:get`,
  );
  if (!res.ok) return res;
  if (res.data.encoding !== "base64") {
    return {
      ok: false,
      reason: "validation_failed",
      status: 200,
      message: `unexpected encoding ${res.data.encoding}`,
    };
  }
  const decoded = Buffer.from(res.data.content, "base64").toString("utf8");
  return { ok: true, data: { content: decoded, sha: res.data.sha } };
}

/**
 * Create a branch off `fromSha`. Returns ok on success, `branch_exists`
 * if the branch is already present (caller should pick a new name).
 */
export async function createBranch(
  owner: string,
  repo: string,
  branchName: string,
  fromSha: string,
): Promise<GhWriteResult<{ ref: string }>> {
  return call<{ ref: string }>(
    `/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
    },
    `github:/repos/${owner}/${repo}/git/refs:create`,
  );
}

/**
 * Create or update a file on a branch. If `sha` is provided, this is
 * an update; otherwise a create. PUT /repos/:owner/:repo/contents/:path
 * is the GitHub-blessed shape for both.
 */
export async function createOrUpdateFile(
  owner: string,
  repo: string,
  args: {
    path: string;
    branch: string;
    contentUtf8: string;
    message: string;
    sha?: string;
  },
): Promise<GhWriteResult<{ commitSha: string; contentSha: string }>> {
  const body = JSON.stringify({
    message: args.message,
    content: Buffer.from(args.contentUtf8, "utf8").toString("base64"),
    branch: args.branch,
    ...(args.sha ? { sha: args.sha } : {}),
  });
  const res = await call<{
    commit: { sha: string };
    content: { sha: string } | null;
  }>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path)}`,
    { method: "PUT", body, timeoutMs: 20_000 },
    `github:/repos/${owner}/${repo}/contents:put`,
  );
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      commitSha: res.data.commit.sha,
      contentSha: res.data.content?.sha ?? "",
    },
  };
}

/**
 * Open a pull request. Returns the PR number and the html_url for the
 * AgentRun row + audit log.
 */
export async function createPullRequest(
  owner: string,
  repo: string,
  args: { head: string; base: string; title: string; body: string },
): Promise<GhWriteResult<{ number: number; htmlUrl: string }>> {
  const body = JSON.stringify({
    head: args.head,
    base: args.base,
    title: args.title,
    body: args.body,
    maintainer_can_modify: true,
    draft: false,
  });
  const res = await call<{ number: number; html_url: string }>(
    `/repos/${owner}/${repo}/pulls`,
    { method: "POST", body, timeoutMs: 20_000 },
    `github:/repos/${owner}/${repo}/pulls:create`,
  );
  if (!res.ok) return res;
  return { ok: true, data: { number: res.data.number, htmlUrl: res.data.html_url } };
}
