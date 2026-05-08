/**
 * Path-pattern → risk-flag mapping for the security-sensitive-change
 * evaluator. Pure function so it can be unit-tested without GitHub.
 *
 * The matcher is intentionally conservative:
 *   - matches anywhere in the path (not just the leaf)
 *   - case-insensitive
 *   - the same file can flag multiple categories (a change to
 *     `lib/auth/middleware.ts` is both `auth_change` and a
 *     `security_sensitive_change` aggregate)
 *
 * AgentOps note: future capability `create_github_pull_request` will
 * read these flags off `GitCommitEvent.riskFlagsJson` to surface
 * high-risk PRs to reviewers automatically.
 */

import type { RiskCategory } from "@prisma/client";

interface Rule {
  pattern: RegExp;
  categories: RiskCategory[];
}

const RULES: Rule[] = [
  // Auth boundary
  {
    pattern: /(\bauth\b|\bmiddleware\b|\bpermissions\b|\broles?\b|\bauthz\b|\bclerk\b)/i,
    categories: ["auth_change"],
  },
  // Secrets / API keys (any path mentioning these is sensitive)
  {
    pattern: /(\bapi[_-]?key|\bsecret|\bcredentials?|\btoken|\bwebhook|\bencrypt)/i,
    categories: ["env_config_change"],
  },
  // Audit + security event tables
  {
    pattern: /(\baudit\b|\bsecurity[_-]?event)/i,
    categories: ["security_sensitive_change"],
  },
  // Database schema
  {
    pattern: /(prisma\/(schema\.prisma|migrations\/)|\bschema\.sql\b|\bdb\/migrations\/)/i,
    categories: ["database_change"],
  },
  // Env config / build files
  {
    pattern: /(\.env|\benv\.ts$|next\.config|tsconfig|package\.json|package-lock|Dockerfile|Procfile|railway\.toml|railway\.json)/i,
    categories: ["env_config_change"],
  },
];

/**
 * Map a list of changed file paths to the risk categories they should
 * raise. Always includes a top-level `security_sensitive_change`
 * aggregate when ANY rule matches, so dashboards have one consistent
 * "this commit touched something sensitive" filter.
 */
export function classifyChangedFiles(paths: readonly string[]): RiskCategory[] {
  const hits = new Set<RiskCategory>();
  for (const path of paths) {
    for (const rule of RULES) {
      if (rule.pattern.test(path)) {
        for (const cat of rule.categories) hits.add(cat);
      }
    }
  }
  if (hits.size > 0) hits.add("security_sensitive_change");
  return Array.from(hits);
}
