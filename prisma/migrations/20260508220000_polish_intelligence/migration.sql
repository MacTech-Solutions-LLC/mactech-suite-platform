-- Command Center Slice 4 — Polish + Intelligence
--
-- CommitSummary: daily/weekly/release/etc rollups generated from
-- GitCommitEvent rows. Slice 4 ships a deterministic generator and
-- stubs the AI-augmented path behind ENABLE_AI_SUMMARIES.
--
-- AppDependency: directed edge in the ecosystem graph. Many-to-many
-- with the same pair allowed to carry multiple edges of different
-- types (capture → suite via api_calls AND content_source).

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "CommitSummaryType" AS ENUM (
    'daily', 'weekly', 'release', 'deployment', 'incident', 'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AppDependencyType" AS ENUM (
    'api_calls', 'auth_provider', 'shared_database', 'shared_domain',
    'shared_component', 'content_source', 'evidence_source',
    'training_source', 'capture_source', 'governance_source',
    'qms_source', 'vault_source', 'webhook_source', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CommitSummary ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CommitSummary" (
  "id"                          TEXT NOT NULL PRIMARY KEY,
  "appRegistryId"               TEXT,
  "gitRepositoryId"             TEXT,
  "rangeBaseSha"                TEXT,
  "rangeHeadSha"                TEXT,
  "summaryType"                 "CommitSummaryType" NOT NULL DEFAULT 'manual',
  "executiveSummary"            TEXT NOT NULL,
  "technicalSummary"            TEXT NOT NULL,
  "complianceImpact"            TEXT,
  "riskSummary"                 TEXT,
  "affectedAppsJson"            JSONB,
  "securitySensitiveChangesJson" JSONB,
  "aiAugmented"                 BOOLEAN NOT NULL DEFAULT false,
  "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommitSummary_appRegistryId_fkey"
    FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "CommitSummary_appRegistryId_summaryType_createdAt_idx"
  ON "CommitSummary"("appRegistryId", "summaryType", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CommitSummary_summaryType_createdAt_idx"
  ON "CommitSummary"("summaryType", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CommitSummary_rangeHeadSha_idx"
  ON "CommitSummary"("rangeHeadSha");

-- ── AppDependency ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AppDependency" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "sourceAppRegistryId" TEXT NOT NULL,
  "targetAppRegistryId" TEXT NOT NULL,
  "dependencyType"      "AppDependencyType" NOT NULL DEFAULT 'other',
  "description"         TEXT,
  "criticality"         "AppCriticality"    NOT NULL DEFAULT 'medium',
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppDependency_sourceAppRegistryId_fkey"
    FOREIGN KEY ("sourceAppRegistryId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE,
  CONSTRAINT "AppDependency_targetAppRegistryId_fkey"
    FOREIGN KEY ("targetAppRegistryId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppDependency_sourceAppRegistryId_targetAppRegistryId_dependencyType_key"
  ON "AppDependency"("sourceAppRegistryId", "targetAppRegistryId", "dependencyType");
CREATE INDEX IF NOT EXISTS "AppDependency_sourceAppRegistryId_idx"
  ON "AppDependency"("sourceAppRegistryId");
CREATE INDEX IF NOT EXISTS "AppDependency_targetAppRegistryId_idx"
  ON "AppDependency"("targetAppRegistryId");
CREATE INDEX IF NOT EXISTS "AppDependency_dependencyType_idx"
  ON "AppDependency"("dependencyType");
