export interface BuildMetadata {
  commitSha: string | null;
  commitShortSha: string;
  branch: string;
  repoOwner: string;
  repoName: string;
  provenance: "railway-git" | "explicit-release" | "missing";
}

/**
 * Railway only injects RAILWAY_GIT_* for Git-triggered builds. CLI uploads do
 * not carry those values, so production releases must provide APP_COMMIT_SHA
 * and APP_GIT_BRANCH explicitly instead of being misreported as "dev".
 */
export function resolveBuildMetadata(
  env: Record<string, string | undefined> = process.env,
): BuildMetadata {
  const railwayCommit = env.RAILWAY_GIT_COMMIT_SHA?.trim();
  const explicitCommit = env.APP_COMMIT_SHA?.trim();
  const commitSha = railwayCommit || explicitCommit || null;

  return {
    commitSha,
    commitShortSha: commitSha ? commitSha.slice(0, 7) : "unknown",
    branch: env.RAILWAY_GIT_BRANCH?.trim() || env.APP_GIT_BRANCH?.trim() || "unknown",
    repoOwner: env.RAILWAY_GIT_REPO_OWNER?.trim() || "MacTech-Solutions-LLC",
    repoName: env.RAILWAY_GIT_REPO_NAME?.trim() || "mactech-suite-platform",
    provenance: railwayCommit ? "railway-git" : explicitCommit ? "explicit-release" : "missing",
  };
}
