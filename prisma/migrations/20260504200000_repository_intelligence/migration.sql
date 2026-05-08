-- Command Center Slice 2 — Repository Intelligence
--
-- Adds GitRepository, AppRepositoryLink, GitCommitEvent, GitWorkflowRun
-- so the Suite can correlate "what's in production" against
-- "what's in main" per app, and surface security-sensitive changes
-- across every MacTech repo from one feed.
--
-- The PAT itself never lives here. lib/integrations/github/client.ts
-- holds it; service callers pass repo IDs / SHAs / branch names only.
-- AgentOps capabilities (Slice 5) will receive the same view.

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "GitProvider" AS ENUM ('github');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkflowStatus" AS ENUM ('queued', 'in_progress', 'completed', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WorkflowConclusion" AS ENUM (
    'success', 'failure', 'cancelled', 'skipped',
    'timed_out', 'action_required', 'neutral', 'stale', 'startup_failure'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── GitRepository ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "GitRepository" (
  "id"                     TEXT NOT NULL PRIMARY KEY,
  "owner"                  TEXT NOT NULL,
  "repo"                   TEXT NOT NULL,
  "fullName"               TEXT NOT NULL,
  "htmlUrl"                TEXT,
  "defaultBranch"          TEXT NOT NULL DEFAULT 'main',
  "visibility"             TEXT,
  "provider"               "GitProvider" NOT NULL DEFAULT 'github',
  "installationId"         TEXT,
  "active"                 BOOLEAN NOT NULL DEFAULT true,
  "latestHeadSha"          TEXT,
  "latestHeadShortSha"     TEXT,
  "latestHeadCommittedAt"  TIMESTAMP(3),
  "recentCommitCount"      INTEGER NOT NULL DEFAULT 0,
  "recentWorkflowCount"    INTEGER NOT NULL DEFAULT 0,
  "lastSyncedAt"           TIMESTAMP(3),
  "lastSyncError"          TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "GitRepository_fullName_key"
  ON "GitRepository"("fullName");
CREATE INDEX IF NOT EXISTS "GitRepository_owner_idx"
  ON "GitRepository"("owner");
CREATE INDEX IF NOT EXISTS "GitRepository_active_idx"
  ON "GitRepository"("active");
CREATE INDEX IF NOT EXISTS "GitRepository_provider_idx"
  ON "GitRepository"("provider");

-- ── AppRepositoryLink ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AppRepositoryLink" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "appRegistryId"    TEXT NOT NULL,
  "gitRepositoryId"  TEXT NOT NULL,
  "productionBranch" TEXT NOT NULL DEFAULT 'main',
  "deploymentBranch" TEXT NOT NULL DEFAULT 'main',
  "isPrimary"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppRepositoryLink_appRegistryId_fkey"
    FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE,
  CONSTRAINT "AppRepositoryLink_gitRepositoryId_fkey"
    FOREIGN KEY ("gitRepositoryId") REFERENCES "GitRepository"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppRepositoryLink_appRegistryId_gitRepositoryId_key"
  ON "AppRepositoryLink"("appRegistryId", "gitRepositoryId");
CREATE INDEX IF NOT EXISTS "AppRepositoryLink_appRegistryId_idx"
  ON "AppRepositoryLink"("appRegistryId");
CREATE INDEX IF NOT EXISTS "AppRepositoryLink_gitRepositoryId_idx"
  ON "AppRepositoryLink"("gitRepositoryId");

-- ── GitCommitEvent ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "GitCommitEvent" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "gitRepositoryId"  TEXT NOT NULL,
  "sha"              TEXT NOT NULL,
  "shortSha"         TEXT NOT NULL,
  "branch"           TEXT,
  "authorName"       TEXT,
  "authorEmail"      TEXT,
  "authorLogin"      TEXT,
  "message"          TEXT NOT NULL,
  "htmlUrl"          TEXT,
  "committedAt"      TIMESTAMP(3),
  "pushedAt"         TIMESTAMP(3),
  "filesChanged"     INTEGER NOT NULL DEFAULT 0,
  "additions"        INTEGER NOT NULL DEFAULT 0,
  "deletions"        INTEGER NOT NULL DEFAULT 0,
  "changedFilesJson" JSONB,
  "riskFlagsJson"    JSONB,
  "rawPayloadJson"   JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitCommitEvent_gitRepositoryId_fkey"
    FOREIGN KEY ("gitRepositoryId") REFERENCES "GitRepository"("id") ON DELETE CASCADE
);

-- Idempotency: same sync or same webhook delivery cannot dupe a row.
CREATE UNIQUE INDEX IF NOT EXISTS "GitCommitEvent_gitRepositoryId_sha_key"
  ON "GitCommitEvent"("gitRepositoryId", "sha");
CREATE INDEX IF NOT EXISTS "GitCommitEvent_gitRepositoryId_committedAt_idx"
  ON "GitCommitEvent"("gitRepositoryId", "committedAt" DESC);
CREATE INDEX IF NOT EXISTS "GitCommitEvent_authorEmail_idx"
  ON "GitCommitEvent"("authorEmail");
CREATE INDEX IF NOT EXISTS "GitCommitEvent_branch_idx"
  ON "GitCommitEvent"("branch");
CREATE INDEX IF NOT EXISTS "GitCommitEvent_committedAt_idx"
  ON "GitCommitEvent"("committedAt" DESC);

-- ── GitWorkflowRun ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "GitWorkflowRun" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "gitRepositoryId" TEXT NOT NULL,
  "githubRunId"     BIGINT NOT NULL,
  "name"            TEXT NOT NULL,
  "event"           TEXT NOT NULL,
  "branch"          TEXT,
  "headSha"         TEXT NOT NULL,
  "status"          "WorkflowStatus"     NOT NULL DEFAULT 'unknown',
  "conclusion"      "WorkflowConclusion",
  "htmlUrl"         TEXT,
  "startedAt"       TIMESTAMP(3),
  "completedAt"     TIMESTAMP(3),
  "durationMs"      INTEGER,
  "rawPayloadJson"  JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GitWorkflowRun_gitRepositoryId_fkey"
    FOREIGN KEY ("gitRepositoryId") REFERENCES "GitRepository"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GitWorkflowRun_githubRunId_key"
  ON "GitWorkflowRun"("githubRunId");
CREATE INDEX IF NOT EXISTS "GitWorkflowRun_gitRepositoryId_startedAt_idx"
  ON "GitWorkflowRun"("gitRepositoryId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "GitWorkflowRun_branch_idx"
  ON "GitWorkflowRun"("branch");
CREATE INDEX IF NOT EXISTS "GitWorkflowRun_status_idx"
  ON "GitWorkflowRun"("status");
CREATE INDEX IF NOT EXISTS "GitWorkflowRun_conclusion_idx"
  ON "GitWorkflowRun"("conclusion");
