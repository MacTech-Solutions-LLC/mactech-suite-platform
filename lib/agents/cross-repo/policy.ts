/**
 * Cross-repo patch agent policy — Slice 13.
 *
 * Hard-coded constants that bound what the agent is allowed to do.
 * Lives in code (not the database) on purpose — an unauthorized DB
 * write must never be able to widen the agent's authority. To add a
 * new repo to the allowlist, add it here and merge through normal
 * PR review.
 *
 * Three classes of restriction:
 *   1. Repository allowlist — which repos the agent may touch at all.
 *   2. Path denylist — paths inside an allowed repo it must NEVER write.
 *   3. Change-size cap — total LOC ceiling per PR.
 *
 * All three are enforced both pre-flight (before calling Anthropic)
 * AND in invariants (after the capability returns) so a missed check
 * at one layer is caught at the other.
 */

/**
 * Repos the cross-repo agent is allowed to open PRs against. Each
 * entry is `owner/repo`. A live `ENABLE_CROSS_REPO_AGENT=true` env
 * flag is also required at runtime (see lib/env.ts), so a preview
 * deploy that accidentally reads the production database still
 * cannot fire a PR.
 *
 * Note: NOT included on purpose: `mactech-suite-platform` itself.
 * The agent is for cross-repo work; modifying the Suite belongs in
 * the normal git flow, not behind an agent.
 */
export const CROSS_REPO_ALLOWLIST: readonly string[] = Object.freeze([
  "MacTech-Solutions-LLC/capture",
  "MacTech-Solutions-LLC/codex",
  "MacTech-Solutions-LLC/cleard",
  "MacTech-Solutions-LLC/training",
  "MacTech-Solutions-LLC/quality",
  "MacTech-Solutions-LLC/governanceos",
]);

export function isAllowlistedRepo(repoFullName: string): boolean {
  // Case-sensitive match on purpose — GitHub URLs are case-sensitive
  // for org/repo lookups in some contexts. The allowlist canonicalises
  // capitalization once; callers must pass the canonical form.
  return CROSS_REPO_ALLOWLIST.includes(repoFullName);
}

/**
 * Path patterns the agent must never create or modify. Matched as
 * substring + suffix tests; deliberately conservative.
 *
 * Categories:
 *   - secrets: anything that smells like a key, certificate, or env file
 *   - CI/CD: workflows, deploy scripts, infrastructure-as-code
 *   - lockfiles: package-lock.json / yarn.lock — the agent should
 *     produce a code change, not a dependency upgrade
 *   - top-level config that's load-bearing for security: middleware,
 *     auth handlers
 */
const DENIED_PATH_PATTERNS: ReadonlyArray<{ kind: "exact" | "suffix" | "contains"; value: string; reason: string }> = [
  { kind: "exact", value: "package-lock.json", reason: "lockfile" },
  { kind: "exact", value: "yarn.lock", reason: "lockfile" },
  { kind: "exact", value: "pnpm-lock.yaml", reason: "lockfile" },
  { kind: "exact", value: "bun.lockb", reason: "lockfile" },
  { kind: "exact", value: "middleware.ts", reason: "auth boundary" },
  { kind: "exact", value: "middleware.js", reason: "auth boundary" },
  { kind: "suffix", value: ".env", reason: "secrets file" },
  { kind: "contains", value: "/.env", reason: "secrets file" },
  { kind: "suffix", value: ".pem", reason: "private key" },
  { kind: "suffix", value: ".key", reason: "private key" },
  { kind: "suffix", value: ".p12", reason: "certificate" },
  { kind: "suffix", value: ".pfx", reason: "certificate" },
  { kind: "contains", value: ".github/workflows/", reason: "CI/CD pipeline" },
  { kind: "contains", value: ".github/codeowners", reason: "review policy" },
  { kind: "contains", value: "/dockerfile", reason: "build pipeline" },
  { kind: "exact", value: "Dockerfile", reason: "build pipeline" },
  { kind: "exact", value: "railway.toml", reason: "deploy config" },
  { kind: "exact", value: "railway.json", reason: "deploy config" },
  { kind: "exact", value: "nixpacks.toml", reason: "deploy config" },
  { kind: "contains", value: "terraform/", reason: "infrastructure" },
  { kind: "suffix", value: ".tf", reason: "infrastructure" },
];

export interface DeniedPath {
  path: string;
  reason: string;
}

/** Returns the first denied path found, or null if every path is OK. */
export function firstDeniedPath(paths: readonly string[]): DeniedPath | null {
  for (const path of paths) {
    const lc = path.toLowerCase();
    for (const rule of DENIED_PATH_PATTERNS) {
      if (rule.kind === "exact" && lc === rule.value.toLowerCase()) {
        return { path, reason: rule.reason };
      }
      if (rule.kind === "suffix" && lc.endsWith(rule.value.toLowerCase())) {
        return { path, reason: rule.reason };
      }
      if (rule.kind === "contains" && lc.includes(rule.value.toLowerCase())) {
        return { path, reason: rule.reason };
      }
    }
  }
  return null;
}

/** Maximum total lines across every file in a single PR. Larger
 *  patches must be split into multiple agent runs. The ceiling is
 *  a circuit-breaker — most legitimate fixes (adding a route file,
 *  fixing a bug) come in well under 200 lines. */
export const MAX_TOTAL_LINES_PER_PR = 400;

/** Branch name prefix the agent uses when creating PR branches.
 *  Operators can grep for this in their repos to find every agent-
 *  generated PR. */
export const AGENT_BRANCH_PREFIX = "mactech-agent/";

/** Marker line appended to every agent-generated PR body so reviewers
 *  immediately know how the PR was produced. */
export const AGENT_PR_FOOTER =
  "\n\n---\n_This pull request was opened by the MacTech Suite cross-repo patch agent. The agent does not auto-merge; a human review is required._";
