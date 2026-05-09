-- Slice 6: inter-app traffic observability. AppCallEvent captures one
-- inbound HTTP call to a Suite endpoint, attributed to the calling app
-- via API key (or to a non-app source like "github" / "railway" via
-- sourceLabel). Aggregates power the ecosystem map's edge thickness +
-- the /admin/ops/traffic log.

CREATE TABLE IF NOT EXISTS "AppCallEvent" (
  "id" TEXT PRIMARY KEY,
  "targetAppRegistryId" TEXT,
  "sourceAppRegistryId" TEXT,
  "sourceLabel" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "bytesIn" INTEGER NOT NULL DEFAULT 0,
  "bytesOut" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER,
  "apiKeyId" TEXT,
  "requestId" TEXT,
  "metadataJson" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AppCallEvent_occurredAt_idx" ON "AppCallEvent"("occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "AppCallEvent_targetAppRegistryId_occurredAt_idx"
  ON "AppCallEvent"("targetAppRegistryId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "AppCallEvent_sourceAppRegistryId_occurredAt_idx"
  ON "AppCallEvent"("sourceAppRegistryId", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "AppCallEvent_sourceLabel_occurredAt_idx"
  ON "AppCallEvent"("sourceLabel", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "AppCallEvent_endpoint_idx" ON "AppCallEvent"("endpoint");
CREATE INDEX IF NOT EXISTS "AppCallEvent_statusCode_idx" ON "AppCallEvent"("statusCode");

DO $$ BEGIN
  ALTER TABLE "AppCallEvent"
    ADD CONSTRAINT "AppCallEvent_sourceAppRegistryId_fkey"
    FOREIGN KEY ("sourceAppRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AppCallEvent"
    ADD CONSTRAINT "AppCallEvent_targetAppRegistryId_fkey"
    FOREIGN KEY ("targetAppRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
