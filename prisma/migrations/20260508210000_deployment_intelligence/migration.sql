-- Command Center Slice 3 — Deployment Intelligence
--
-- RailwayResource mirrors a (project, service, environment) tuple in
-- the Suite. DeploymentSnapshot captures one observed deployment +
-- live commit + drift state at a point in time. The Railway API token
-- never lands in either table — only resolved IDs and display
-- metadata. Idempotency on (serviceId, environmentId) for resources
-- and railwayDeploymentId for snapshots.

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "DeploymentStatus" AS ENUM (
    'queued', 'initializing', 'building', 'deploying',
    'success', 'failed', 'crashed', 'removed',
    'restarting', 'sleeping', 'skipped', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeploymentDriftStatus" AS ENUM (
    'in_sync', 'behind', 'ahead', 'diverged', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RailwayResource ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "RailwayResource" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "appRegistryId"       TEXT,
  "projectId"           TEXT NOT NULL,
  "projectName"         TEXT,
  "serviceId"           TEXT NOT NULL,
  "serviceName"         TEXT,
  "environmentId"       TEXT NOT NULL,
  "environmentName"     TEXT,
  "publicDomain"        TEXT,
  "railwayDashboardUrl" TEXT,
  "active"              BOOLEAN NOT NULL DEFAULT true,
  "lastSyncedAt"        TIMESTAMP(3),
  "lastSyncError"       TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RailwayResource_appRegistryId_fkey"
    FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "RailwayResource_serviceId_environmentId_key"
  ON "RailwayResource"("serviceId", "environmentId");
CREATE INDEX IF NOT EXISTS "RailwayResource_appRegistryId_idx"
  ON "RailwayResource"("appRegistryId");
CREATE INDEX IF NOT EXISTS "RailwayResource_projectId_idx"
  ON "RailwayResource"("projectId");
CREATE INDEX IF NOT EXISTS "RailwayResource_active_idx"
  ON "RailwayResource"("active");

-- ── DeploymentSnapshot ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DeploymentSnapshot" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "appRegistryId"         TEXT,
  "railwayResourceId"     TEXT NOT NULL,
  "railwayDeploymentId"   TEXT NOT NULL,
  "railwayStatus"         "DeploymentStatus"      NOT NULL DEFAULT 'unknown',
  "railwayStatusRaw"      TEXT,
  "healthStatus"          "HealthStatus",
  "healthStatusRaw"       TEXT,
  "healthStatusCode"      INTEGER,
  "healthLatencyMs"       INTEGER,
  "liveCommitSha"         TEXT,
  "liveCommitShortSha"    TEXT,
  "liveBranch"            TEXT,
  "liveRepo"              TEXT,
  "githubHeadSha"         TEXT,
  "githubHeadShortSha"    TEXT,
  "commitsBehind"         INTEGER,
  "commitsAhead"          INTEGER,
  "productionDriftStatus" "DeploymentDriftStatus" NOT NULL DEFAULT 'unknown',
  "lastSuccessfulCheckAt" TIMESTAMP(3),
  "checkedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadataJson"          JSONB,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeploymentSnapshot_appRegistryId_fkey"
    FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL,
  CONSTRAINT "DeploymentSnapshot_railwayResourceId_fkey"
    FOREIGN KEY ("railwayResourceId") REFERENCES "RailwayResource"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeploymentSnapshot_railwayDeploymentId_key"
  ON "DeploymentSnapshot"("railwayDeploymentId");
CREATE INDEX IF NOT EXISTS "DeploymentSnapshot_railwayResourceId_checkedAt_idx"
  ON "DeploymentSnapshot"("railwayResourceId", "checkedAt" DESC);
CREATE INDEX IF NOT EXISTS "DeploymentSnapshot_appRegistryId_checkedAt_idx"
  ON "DeploymentSnapshot"("appRegistryId", "checkedAt" DESC);
CREATE INDEX IF NOT EXISTS "DeploymentSnapshot_railwayStatus_idx"
  ON "DeploymentSnapshot"("railwayStatus");
CREATE INDEX IF NOT EXISTS "DeploymentSnapshot_productionDriftStatus_idx"
  ON "DeploymentSnapshot"("productionDriftStatus");
CREATE INDEX IF NOT EXISTS "DeploymentSnapshot_checkedAt_idx"
  ON "DeploymentSnapshot"("checkedAt" DESC);
