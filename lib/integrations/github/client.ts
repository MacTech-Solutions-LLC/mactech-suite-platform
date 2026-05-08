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
  };
}

// ─── Raw GitHub response shapes (we only narrow what we use) ──────────────

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
