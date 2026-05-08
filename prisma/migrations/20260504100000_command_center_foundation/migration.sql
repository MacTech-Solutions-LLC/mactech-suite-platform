-- Command Center Foundation (Slice 1)
--
-- Adds operational metadata to AppRegistry so it becomes the canonical
-- ecosystem registry, and lays down three new tables that drive the
-- /command-center surface: HealthCheckSnapshot (per-probe results),
-- OperationalRiskFlag (idempotent open-flag rows), and IntegrationEvent
-- (timeline envelope for any external/internal integration event).
--
-- Postgres-flavored. Idempotent where possible (CREATE TYPE IF NOT
-- EXISTS isn't a thing in Postgres, so we DO blocks on enum creation).

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "AppCriticality" AS ENUM ('low', 'medium', 'high', 'mission_critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AppLifecycle" AS ENUM ('planned', 'development', 'staging', 'production', 'deprecated', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AppVisibility" AS ENUM ('internal', 'customer', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "HealthStatus" AS ENUM ('up', 'degraded', 'down', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RiskSeverity" AS ENUM ('info', 'low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RiskStatus" AS ENUM ('open', 'acknowledged', 'resolved', 'ignored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RiskCategory" AS ENUM (
    'health_down', 'degraded', 'failed_deployment', 'crashed_deployment',
    'failed_workflow', 'production_behind_main', 'stale_deployment',
    'security_sensitive_change', 'database_change', 'auth_change',
    'env_config_change', 'webhook_failure', 'missing_health_endpoint',
    'missing_build_info', 'missing_repo_mapping', 'missing_railway_mapping'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IntegrationProvider" AS ENUM ('github', 'railway', 'cloudflare', 'clerk', 'internal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── AppRegistry: operational metadata ────────────────────────────────────────

ALTER TABLE "AppRegistry"
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "publicUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "adminUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "healthUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "buildInfoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "docsUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "supportUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "subdomain" TEXT,
  ADD COLUMN IF NOT EXISTS "apexDomain" TEXT,
  ADD COLUMN IF NOT EXISTS "criticality" "AppCriticality" NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS "lifecycle" "AppLifecycle" NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS "visibility" "AppVisibility" NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS "ownerName" TEXT,
  ADD COLUMN IF NOT EXISTS "ownerEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "repoFullName" TEXT,
  ADD COLUMN IF NOT EXISTS "repoDefaultBranch" TEXT DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS "railwayProjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "railwayServiceId" TEXT,
  ADD COLUMN IF NOT EXISTS "railwayEnvironmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "railwayEnvironmentName" TEXT DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS "cloudflareZoneId" TEXT,
  ADD COLUMN IF NOT EXISTS "cloudflareHostname" TEXT,
  ADD COLUMN IF NOT EXISTS "complianceRelevanceJson" JSONB,
  ADD COLUMN IF NOT EXISTS "dependencyNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "operationalNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "lastObservedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "AppRegistry_slug_key" ON "AppRegistry"("slug");
CREATE INDEX IF NOT EXISTS "AppRegistry_criticality_idx" ON "AppRegistry"("criticality");
CREATE INDEX IF NOT EXISTS "AppRegistry_lifecycle_idx" ON "AppRegistry"("lifecycle");
CREATE INDEX IF NOT EXISTS "AppRegistry_repoFullName_idx" ON "AppRegistry"("repoFullName");

-- ── HealthCheckSnapshot ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "HealthCheckSnapshot" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "appRegistryId"    TEXT NOT NULL,
  "url"              TEXT NOT NULL,
  "status"           "HealthStatus" NOT NULL DEFAULT 'unknown',
  "statusCode"       INTEGER,
  "latencyMs"        INTEGER,
  "responseBodyHead" TEXT,
  "errorMessage"     TEXT,
  "checkedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthCheckSnapshot_appRegistryId_fkey"
    FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "HealthCheckSnapshot_appRegistryId_checkedAt_idx"
  ON "HealthCheckSnapshot"("appRegistryId", "checkedAt" DESC);
CREATE INDEX IF NOT EXISTS "HealthCheckSnapshot_status_idx"
  ON "HealthCheckSnapshot"("status");
CREATE INDEX IF NOT EXISTS "HealthCheckSnapshot_checkedAt_idx"
  ON "HealthCheckSnapshot"("checkedAt" DESC);

-- ── OperationalRiskFlag ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "OperationalRiskFlag" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "appRegistryId"   TEXT,
  "gitRepositoryId" TEXT,
  "severity"        "RiskSeverity" NOT NULL DEFAULT 'medium',
  "status"          "RiskStatus"   NOT NULL DEFAULT 'open',
  "category"        "RiskCategory" NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "detectedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"      TIMESTAMP(3),
  "acknowledgedAt"  TIMESTAMP(3),
  "acknowledgedBy"  TEXT,
  "metadataJson"    JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalRiskFlag_appRegistryId_fkey"
    FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL
);

-- Idempotency: at most one OPEN flag of a given (app, category) pair at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "OperationalRiskFlag_appRegistryId_category_status_key"
  ON "OperationalRiskFlag"("appRegistryId", "category", "status");
CREATE INDEX IF NOT EXISTS "OperationalRiskFlag_severity_idx"
  ON "OperationalRiskFlag"("severity");
CREATE INDEX IF NOT EXISTS "OperationalRiskFlag_status_idx"
  ON "OperationalRiskFlag"("status");
CREATE INDEX IF NOT EXISTS "OperationalRiskFlag_category_idx"
  ON "OperationalRiskFlag"("category");
CREATE INDEX IF NOT EXISTS "OperationalRiskFlag_detectedAt_idx"
  ON "OperationalRiskFlag"("detectedAt" DESC);

-- ── IntegrationEvent ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "IntegrationEvent" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "provider"        "IntegrationProvider" NOT NULL,
  "eventType"       TEXT NOT NULL,
  "eventAction"     TEXT,
  "resourceType"    TEXT,
  "resourceId"      TEXT,
  "appRegistryId"   TEXT,
  "gitRepositoryId" TEXT,
  "severity"        "RiskSeverity" NOT NULL DEFAULT 'info',
  "payloadJson"     JSONB,
  "receivedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationEvent_appRegistryId_fkey"
    FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IntegrationEvent_provider_receivedAt_idx"
  ON "IntegrationEvent"("provider", "receivedAt" DESC);
CREATE INDEX IF NOT EXISTS "IntegrationEvent_eventType_idx"
  ON "IntegrationEvent"("eventType");
CREATE INDEX IF NOT EXISTS "IntegrationEvent_appRegistryId_receivedAt_idx"
  ON "IntegrationEvent"("appRegistryId", "receivedAt" DESC);
