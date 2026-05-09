/**
 * GitHub REST client. Server-only — the PAT lives in env and never
 * leaves this file. Callers receive structured outcomes; raw HTTP
 * details and error bodies are logged but not returned to the UI.
 *
 * AgentOps discipline: this is the only file in the codebase that
 * speaks to GitHub. Future capabilities (`create_github_issue`,
 * `create_github_pull_request`, …) are thin wrappers around methods
 * declared here. They take resource IDs / SHAs / branch names and
 * never the token.
 */

import { env } from "@/lib/env";

const API_BASE = "https://api.github.com";

interface RequestOptions {
  /** ms before the request aborts. Default 8000 — generous enough for
   *  a slow listCommits, tight enough to keep the recon loop moving. */
  timeoutMs?: number;
  /** Override the User-Agent for tests. Default the Suite UA. */
  userAgent?: string;
}

export interface GitHubClientFailure {
  ok: false;
  reason:
    | "not_configured"
    | "unauthorized"
    | "not_found"
    | "rate_limited"
    | "transient"
    | "abuse_detected"
    | "validation_failed";
  status: number;
}

export type GitHubResult<T> = ({ ok: true } & T) | GitHubClientFailure;

// ─── Read shapes ──────────────────────────────────────────────────────────

export interface GitHubRepoSummary {
  id: number;
  fullName: string;
  owner: string;
  repo: string;
  htmlUrl: string;
  defaultBranch: string;
  visibility: string | null;
  archived: boolean;
  pushedAt: string | null;
}

export interface GitHubBranchHead {
  branch: string;
  sha: string;
  shortSha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  authorLogin: string | null;
  committedAt: string | null;
  htmlUrl: string;
}

export interface GitHubCompare {
  base: string;
  head: string;
  status: "identical" | "ahead" | "behind" | "diverged";
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  htmlUrl: string;
}

export interface GitHubCommitDetail {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  authorLogin: string | null;
  committedAt: string | null;
  htmlUrl: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  files: string[];
}

export interface GitHubWorkflowRunSummary {
  id: number;
  name: string;
  event: string;
  branch: string | null;
  headSha: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GitHubPullRequestSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  htmlUrl: string;
  authorLogin: string | null;
  createdAt: string;
  updatedAt: string;
  baseBranch: string;
  headBranch: string;
  /** Reviewers + assignees count — informs "needs review" surface. */
  reviewerCount: number;
  /** Comment count from GitHub (issue + review comments combined). */
  commentCount: number;
}

export interface GitHubIssueSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  htmlUrl: string;
  authorLogin: string | null;
  createdAt: string;
  updatedAt: string;
  /** Slice-7 surface: which labels the issue carries — operators
   *  filter on these to identify ops vs bug vs feature. */
  labels: string[];
  commentCount: number;
}

// ─── Client ───────────────────────────────────────────────────────────────

export interface GitHubClient {
  configured: boolean;
  getRepo(owner: string, repo: string): Promise<GitHubResult<{ data: GitHubRepoSummary }>>;
  getBranchHead(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubResult<{ data: GitHubBranchHead }>>;
  compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string,
  ): Promise<GitHubResult<{ data: GitHubCompare }>>;
  listRecentCommits(
    owner: string,
    repo: string,
    branch: string,
    perPage?: number,
  ): Promise<GitHubResult<{ data: GitHubCommitDetail[] }>>;
  getCommit(
    owner: string,
    repo: string,
    sha: string,
  ): Promise<GitHubResult<{ data: GitHubCommitDetail }>>;
  listWorkflowRuns(
    owner: string,
    repo: string,
    branch?: string,
    perPage?: number,
  ): Promise<GitHubResult<{ data: GitHubWorkflowRunSummary[] }>>;
  /**
   * AgentOps write capability — opens a GitHub issue. Token-isolated:
   * the only callsite is lib/agents/capabilities/github.ts and the
   * approval gate has already passed by the time this is invoked.
   */
  createIssue(
    owner: string,
    repo: string,
    input: { title: string; body: string; labels?: string[] },
  ): Promise<GitHubResult<{ data: { number: number; htmlUrl: string } }>>;
  /**
   * Slice 7: list open pull requests for the per-app investigate page.
   * Returns the most recent N (capped at 30) so the UI can render a
   * "PRs awaiting review" panel without paginating.
   */
  listOpenPullRequests(
    owner: string,
    repo: string,
    perPage?: number,
  ): Promise<GitHubResult<{ data: GitHubPullRequestSummary[] }>>;
  /**
   * Slice 7: list open issues (non-PR) for the same panel. GitHub's
   * /issues endpoint returns both PRs and issues; we filter to issues
   * only here.
   */
  listOpenIssues(
    owner: string,
    repo: string,
    perPage?: number,
  ): Promise<GitHubResult<{ data: GitHubIssueSummary[] }>>;
}

export function getGitHubClient(): GitHubClient {
  const token = env.GITHUB_TOKEN;
  const enabled = env.ENABLE_GITHUB_SYNC && Boolean(token);
  if (!enabled) {
    return makeUnconfiguredClient();
  }
  return makeRealClient(token!);
}

function makeUnconfiguredClient(): GitHubClient {
  const fail = async (): Promise<GitHubClientFailure> => ({
    ok: false,
    reason: "not_configured",
    status: 0,
  });
  return {
    configured: false,
    getRepo: fail as GitHubClient["getRepo"],
    getBranchHead: fail as GitHubClient["getBranchHead"],
    compareCommits: fail as GitHubClient["compareCommits"],
    listRecentCommits: fail as GitHubClient["listRecentCommits"],
    getCommit: fail as GitHubClient["getCommit"],
    listWorkflowRuns: fail as GitHubClient["listWorkflowRuns"],
    createIssue: fail as GitHubClient["createIssue"],
    listOpenPullRequests: fail as GitHubClient["listOpenPullRequests"],
    listOpenIssues: fail as GitHubClient["listOpenIssues"],
  };
}

function makeRealClient(token: string): GitHubClient {
  async function fetchJson<T>(
    path: string,
    opts: RequestOptions = {},
  ): Promise<GitHubResult<{ data: T }>> {
    const url = `${API_BASE}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    const startedAt = Date.now();
    let statusForTraffic = 0;
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": opts.userAgent ?? "MacTechCommandCenter/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      statusForTraffic = resp.status;
      if (resp.status === 401) {
        return { ok: false, reason: "unauthorized", status: 401 };
      }
      if (resp.status === 404) {
        return { ok: false, reason: "not_found", status: 404 };
      }
      if (resp.status === 403) {
        const isRateLimit =
          resp.headers.get("x-ratelimit-remaining") === "0" ||
          (await resp.clone().text().catch(() => "")).includes("rate limit");
        return {
          ok: false,
          reason: isRateLimit ? "rate_limited" : "abuse_detected",
          status: 403,
        };
      }
      if (resp.status === 422) {
        return { ok: false, reason: "validation_failed", status: 422 };
      }
      if (!resp.ok) {
        return { ok: false, reason: "transient", status: resp.status };
      }
      const data = (await resp.json()) as T;
      return { ok: true, data };
    } catch (_err) {
      return { ok: false, reason: "transient", status: 0 };
    } finally {
      clearTimeout(timeout);
      // Slice 6.1 outbound traffic instrumentation. Lazy-imported so a
      // service-layer cycle (lib/agents/llm.ts also imports the
      // traffic service) cannot turn into a load-order issue. Same
      // try/never-throw contract as recordAppCall.
      try {
        const { recordOutboundCall } = await import(
          "@/lib/services/command-center/traffic-service"
        );
        void recordOutboundCall({
          targetLabel: "github",
          endpoint: `github:${path.split("?")[0]}`,
          method: "GET",
          statusCode: statusForTraffic || 0,
          durationMs: Date.now() - startedAt,
        });
      } catch {
        /* observability never blocks */
      }
    }
  }

  return {
    configured: true,

    async getRepo(owner, repo) {
      const r = await fetchJson<RawRepo>(`/repos/${owner}/${repo}`);
      if (!r.ok) return r;
      return {
        ok: true,
        data: {
          id: r.data.id,
          fullName: r.data.full_name,
          owner: r.data.owner.login,
          repo: r.data.name,
          htmlUrl: r.data.html_url,
          defaultBranch: r.data.default_branch,
          visibility: r.data.visibility ?? (r.data.private ? "private" : "public"),
          archived: r.data.archived,
          pushedAt: r.data.pushed_at,
        },
      };
    },

    async getBranchHead(owner, repo, branch) {
      const r = await fetchJson<RawBranch>(
        `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
      );
      if (!r.ok) return r;
      const c = r.data.commit;
      return {
        ok: true,
        data: {
          branch: r.data.name,
          sha: c.sha,
          shortSha: c.sha.slice(0, 7),
          message: c.commit?.message ?? "",
          authorName: c.commit?.author?.name ?? null,
          authorEmail: c.commit?.author?.email ?? null,
          authorLogin: c.author?.login ?? null,
          committedAt: c.commit?.author?.date ?? null,
          htmlUrl: c.html_url,
        },
      };
    },

    async compareCommits(owner, repo, base, head) {
      const r = await fetchJson<RawCompare>(
        `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
      );
      if (!r.ok) return r;
      return {
        ok: true,
        data: {
          base,
          head,
          status: r.data.status as GitHubCompare["status"],
          aheadBy: r.data.ahead_by,
          behindBy: r.data.behind_by,
          totalCommits: r.data.total_commits,
          htmlUrl: r.data.html_url,
        },
      };
    },

    async listRecentCommits(owner, repo, branch, perPage = 30) {
      const r = await fetchJson<RawCommitListing[]>(
        `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`,
      );
      if (!r.ok) return r;
      // The list endpoint returns less detail than `/commits/{sha}`.
      // We surface what we have; per-commit detail (file paths, diff
      // stats) is fetched on demand by getCommit() for the
      // security-sensitive-change evaluator.
      return {
        ok: true,
        data: r.data.map((c) => ({
          sha: c.sha,
          shortSha: c.sha.slice(0, 7),
          message: c.commit?.message ?? "",
          authorName: c.commit?.author?.name ?? null,
          authorEmail: c.commit?.author?.email ?? null,
          authorLogin: c.author?.login ?? null,
          committedAt: c.commit?.author?.date ?? null,
          htmlUrl: c.html_url,
          filesChanged: 0,
          additions: 0,
          deletions: 0,
          files: [],
        })),
      };
    },

    async getCommit(owner, repo, sha) {
      const r = await fetchJson<RawCommitDetail>(
        `/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`,
      );
      if (!r.ok) return r;
      return {
        ok: true,
        data: {
          sha: r.data.sha,
          shortSha: r.data.sha.slice(0, 7),
          message: r.data.commit?.message ?? "",
          authorName: r.data.commit?.author?.name ?? null,
          authorEmail: r.data.commit?.author?.email ?? null,
          authorLogin: r.data.author?.login ?? null,
          committedAt: r.data.commit?.author?.date ?? null,
          htmlUrl: r.data.html_url,
          filesChanged: r.data.files?.length ?? 0,
          additions: r.data.stats?.additions ?? 0,
          deletions: r.data.stats?.deletions ?? 0,
          files: r.data.files?.map((f) => f.filename) ?? [],
        },
      };
    },

    async listWorkflowRuns(owner, repo, branch, perPage = 30) {
      const qs = new URLSearchParams();
      if (branch) qs.set("branch", branch);
      qs.set("per_page", String(perPage));
      const r = await fetchJson<RawWorkflowRunsResponse>(
        `/repos/${owner}/${repo}/actions/runs?${qs.toString()}`,
      );
      if (!r.ok) return r;
      return {
        ok: true,
        data: r.data.workflow_runs.map((w) => ({
          id: w.id,
          name: w.name ?? w.workflow_id?.toString() ?? "",
          event: w.event,
          branch: w.head_branch ?? null,
          headSha: w.head_sha,
          status: w.status,
          conclusion: w.conclusion,
          htmlUrl: w.html_url,
          startedAt: w.run_started_at ?? w.created_at ?? null,
          completedAt: w.updated_at ?? null,
        })),
      };
    },

    async createIssue(owner, repo, input) {
      // POST against /repos/:owner/:repo/issues. Token-isolated; the
      // calling capability has already been through plan + approval.
      const url = `${API_BASE}/repos/${owner}/${repo}/issues`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const startedAt = Date.now();
      const bodyJson = JSON.stringify({
        title: input.title,
        body: input.body,
        labels: input.labels ?? undefined,
      });
      let statusForTraffic = 0;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "MacTechCommandCenter/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: bodyJson,
          signal: controller.signal,
          cache: "no-store",
        });
        statusForTraffic = resp.status;
        if (resp.status === 401) return { ok: false, reason: "unauthorized", status: 401 };
        if (resp.status === 404) return { ok: false, reason: "not_found", status: 404 };
        if (resp.status === 403) return { ok: false, reason: "abuse_detected", status: 403 };
        if (resp.status === 422) return { ok: false, reason: "validation_failed", status: 422 };
        if (!resp.ok) return { ok: false, reason: "transient", status: resp.status };
        const body = (await resp.json()) as { number: number; html_url: string };
        return { ok: true, data: { number: body.number, htmlUrl: body.html_url } };
      } catch {
        return { ok: false, reason: "transient", status: 0 };
      } finally {
        clearTimeout(timeout);
        try {
          const { recordOutboundCall } = await import(
            "@/lib/services/command-center/traffic-service"
          );
          void recordOutboundCall({
            targetLabel: "github",
            endpoint: `github:/repos/${owner}/${repo}/issues`,
            method: "POST",
            statusCode: statusForTraffic || 0,
            bytesOut: bodyJson.length,
            durationMs: Date.now() - startedAt,
          });
        } catch {
          /* observability never blocks */
        }
      }
    },

    async listOpenPullRequests(owner, repo, perPage = 20) {
      const qs = new URLSearchParams({
        state: "open",
        per_page: String(Math.min(perPage, 30)),
        sort: "updated",
        direction: "desc",
      });
      const r = await fetchJson<RawPullRequestList>(
        `/repos/${owner}/${repo}/pulls?${qs.toString()}`,
      );
      if (!r.ok) return r;
      return {
        ok: true,
        data: r.data.map((pr) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state as "open" | "closed",
          draft: Boolean(pr.draft),
          htmlUrl: pr.html_url,
          authorLogin: pr.user?.login ?? null,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          baseBranch: pr.base?.ref ?? "",
          headBranch: pr.head?.ref ?? "",
          reviewerCount:
            (pr.requested_reviewers?.length ?? 0) + (pr.assignees?.length ?? 0),
          commentCount: (pr.comments ?? 0) + (pr.review_comments ?? 0),
        })),
      };
    },

    async listOpenIssues(owner, repo, perPage = 20) {
      // GitHub /issues returns BOTH issues and PRs; the PR rows carry
      // a `pull_request` field. We filter those out here so the panel
      // shows pure issues. PRs have their own dedicated panel.
      const qs = new URLSearchParams({
        state: "open",
        per_page: String(Math.min(perPage, 30)),
        sort: "updated",
        direction: "desc",
      });
      const r = await fetchJson<RawIssueList>(
        `/repos/${owner}/${repo}/issues?${qs.toString()}`,
      );
      if (!r.ok) return r;
      return {
        ok: true,
        data: r.data
          .filter((i) => !i.pull_request)
          .map((i) => ({
            number: i.number,
            title: i.title,
            state: i.state as "open" | "closed",
            htmlUrl: i.html_url,
            authorLogin: i.user?.login ?? null,
            createdAt: i.created_at,
            updatedAt: i.updated_at,
            labels: (i.labels ?? [])
              .map((l) => (typeof l === "string" ? l : l.name))
              .filter((s): s is string => typeof s === "string"),
            commentCount: i.comments ?? 0,
          })),
      };
    },
  };
}

// ─── Raw GitHub response shapes (we only narrow what we use) ──────────────

interface RawPullRequestList extends Array<{
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  html_url: string;
  user?: { login?: string } | null;
  created_at: string;
  updated_at: string;
  base?: { ref?: string };
  head?: { ref?: string };
  requested_reviewers?: Array<unknown>;
  assignees?: Array<unknown>;
  comments?: number;
  review_comments?: number;
}> {}

interface RawIssueList extends Array<{
  number: number;
  title: string;
  state: string;
  html_url: string;
  user?: { login?: string } | null;
  created_at: string;
  updated_at: string;
  labels?: Array<string | { name: string }>;
  comments?: number;
  pull_request?: unknown; // present means this is a PR, not an issue
}> {}

interface RawRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  html_url: string;
  default_branch: string;
  visibility?: string;
  private: boolean;
  archived: boolean;
  pushed_at: string | null;
}

interface RawCommitAuthor {
  name?: string;
  email?: string;
  date?: string;
}

interface RawCommitCommit {
  message: string;
  author?: RawCommitAuthor;
}

interface RawCommitListing {
  sha: string;
  html_url: string;
  commit: RawCommitCommit;
  author: { login: string } | null;
}

interface RawCommitDetail extends RawCommitListing {
  stats?: { additions: number; deletions: number; total: number };
  files?: Array<{ filename: string }>;
}

interface RawBranch {
  name: string;
  commit: {
    sha: string;
    html_url: string;
    commit: RawCommitCommit;
    author: { login: string } | null;
  };
}

interface RawCompare {
  status: string; // "identical" | "ahead" | "behind" | "diverged"
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  html_url: string;
}

interface RawWorkflowRunsResponse {
  total_count: number;
  workflow_runs: Array<{
    id: number;
    name: string | null;
    workflow_id?: number;
    event: string;
    head_branch: string | null;
    head_sha: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    run_started_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
}
