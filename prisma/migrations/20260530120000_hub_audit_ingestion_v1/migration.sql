-- Hub Audit Ingestion v1
--
-- Authority mapping:
-- - "AuditLog" is the canonical Hub suite-wide audit/event authority.
-- - "AuditEvent" remains a deprecated legacy compatibility table.
-- - "SecurityEvent", "IntegrationEvent", and "AppCallEvent" remain local
--   operational/security evidence, not audit authority.
--
-- Backfill strategy:
-- Existing AuditLog rows receive deterministic sequence numbers and legacy
-- hashes ordered by timestamp/createdAt/id. New runtime writes use the
-- application canonical payload hash builder.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'object_reference_write'
      AND enumtypid = '"ApiKeyScope"'::regtype
  ) THEN
    ALTER TYPE "ApiKeyScope" ADD VALUE 'object_reference_write';
  END IF;
END $$;

CREATE TYPE "SuiteObjectReferenceVerificationStatus" AS ENUM (
  'pending',
  'verified',
  'failed',
  'deprecated'
);

CREATE TABLE "SuiteObjectReference" (
  "id" TEXT NOT NULL,
  "sourceAppKey" TEXT NOT NULL,
  "owningAppKey" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "objectVersion" TEXT,
  "objectHash" TEXT,
  "tenantOrgId" TEXT,
  "organizationId" TEXT,
  "createdByHubUserId" TEXT,
  "createdByServiceId" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastVerifiedAt" TIMESTAMP(3),
  "verificationStatus" "SuiteObjectReferenceVerificationStatus" NOT NULL DEFAULT 'pending',
  "deprecatedAt" TIMESTAMP(3),
  "replacedByReferenceId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SuiteObjectReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditExportManifest" (
  "id" TEXT NOT NULL,
  "exportBatchId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "appFiltersJson" JSONB,
  "firstSequence" INTEGER,
  "lastSequence" INTEGER,
  "firstHash" TEXT,
  "lastHash" TEXT,
  "eventCount" INTEGER NOT NULL,
  "exportHash" TEXT NOT NULL,
  "signerIdentity" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditExportManifest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuditLog" ADD COLUMN "sequenceNumber" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN "previousHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "currentHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "canonicalPayloadHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorHubUserId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorServiceId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "tenantOrgId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "sourceAppKey" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "objectType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "objectId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "objectVersion" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "objectHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "suiteObjectReferenceId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "beforeJson" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "afterJson" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "signature" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "exportBatchId" TEXT;

WITH ordered AS (
  SELECT
    a."id",
    row_number() OVER (ORDER BY a."timestamp" ASC, a."createdAt" ASC, a."id" ASC)::integer AS seq,
    encode(
      digest(
        concat_ws(
          '|',
          'legacy-audit-v1',
          a."id",
          a."timestamp"::text,
          a."eventType",
          a."action",
          coalesce(a."resourceType", ''),
          coalesce(a."resourceId", '')
        ),
        'sha256'
      ),
      'hex'
    ) AS row_hash
  FROM "AuditLog" a
),
chained AS (
  SELECT
    ordered.*,
    coalesce(
      lag(ordered.row_hash) OVER (ORDER BY ordered.seq ASC),
      repeat('0', 64)
    ) AS previous_hash
  FROM ordered
)
UPDATE "AuditLog" a
SET
  "sequenceNumber" = chained.seq,
  "previousHash" = chained.previous_hash,
  "currentHash" = chained.row_hash,
  "canonicalPayloadHash" = chained.row_hash,
  "actorHubUserId" = a."actorUserProfileId",
  "organizationId" = a."customerOrganizationId",
  "tenantOrgId" = a."customerOrganizationId",
  "sourceAppKey" = app."appKey",
  "objectType" = a."resourceType",
  "objectId" = a."resourceId"
FROM chained
LEFT JOIN "AppRegistry" app ON app."id" = a."appRegistryId"
WHERE a."id" = chained."id";

UPDATE "AuditLog"
SET "sourceAppKey" = 'hub'
WHERE "sourceAppKey" IS NULL;

UPDATE "AuditLog"
SET
  "sequenceNumber" = 1,
  "previousHash" = repeat('0', 64),
  "currentHash" = encode(digest('empty-audit-chain', 'sha256'), 'hex'),
  "canonicalPayloadHash" = encode(digest('empty-audit-chain', 'sha256'), 'hex'),
  "sourceAppKey" = 'hub'
WHERE "sequenceNumber" IS NULL;

ALTER TABLE "AuditLog" ALTER COLUMN "sequenceNumber" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "previousHash" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "currentHash" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "canonicalPayloadHash" SET NOT NULL;

CREATE SEQUENCE IF NOT EXISTS "AuditLog_sequenceNumber_seq";
SELECT setval(
  '"AuditLog_sequenceNumber_seq"',
  COALESCE((SELECT MAX("sequenceNumber") FROM "AuditLog"), 0) + 1,
  false
);
ALTER TABLE "AuditLog" ALTER COLUMN "sequenceNumber" SET DEFAULT nextval('"AuditLog_sequenceNumber_seq"');
ALTER SEQUENCE "AuditLog_sequenceNumber_seq" OWNED BY "AuditLog"."sequenceNumber";

CREATE UNIQUE INDEX "SuiteObjectReference_owningAppKey_objectType_objectId_objectVersion_key"
  ON "SuiteObjectReference"("owningAppKey", "objectType", "objectId", "objectVersion");
CREATE INDEX "SuiteObjectReference_sourceAppKey_idx" ON "SuiteObjectReference"("sourceAppKey");
CREATE INDEX "SuiteObjectReference_owningAppKey_idx" ON "SuiteObjectReference"("owningAppKey");
CREATE INDEX "SuiteObjectReference_objectType_idx" ON "SuiteObjectReference"("objectType");
CREATE INDEX "SuiteObjectReference_objectId_idx" ON "SuiteObjectReference"("objectId");
CREATE INDEX "SuiteObjectReference_tenantOrgId_idx" ON "SuiteObjectReference"("tenantOrgId");
CREATE INDEX "SuiteObjectReference_organizationId_idx" ON "SuiteObjectReference"("organizationId");
CREATE INDEX "SuiteObjectReference_createdByHubUserId_idx" ON "SuiteObjectReference"("createdByHubUserId");
CREATE INDEX "SuiteObjectReference_createdByServiceId_idx" ON "SuiteObjectReference"("createdByServiceId");
CREATE INDEX "SuiteObjectReference_verificationStatus_idx" ON "SuiteObjectReference"("verificationStatus");
CREATE INDEX "SuiteObjectReference_deprecatedAt_idx" ON "SuiteObjectReference"("deprecatedAt");
CREATE INDEX "SuiteObjectReference_replacedByReferenceId_idx" ON "SuiteObjectReference"("replacedByReferenceId");

CREATE UNIQUE INDEX "AuditExportManifest_exportBatchId_key" ON "AuditExportManifest"("exportBatchId");
CREATE INDEX "AuditExportManifest_createdAt_idx" ON "AuditExportManifest"("createdAt");
CREATE INDEX "AuditExportManifest_firstSequence_idx" ON "AuditExportManifest"("firstSequence");
CREATE INDEX "AuditExportManifest_lastSequence_idx" ON "AuditExportManifest"("lastSequence");
CREATE INDEX "AuditExportManifest_exportHash_idx" ON "AuditExportManifest"("exportHash");

CREATE UNIQUE INDEX "AuditLog_sequenceNumber_key" ON "AuditLog"("sequenceNumber");
CREATE UNIQUE INDEX "AuditLog_currentHash_key" ON "AuditLog"("currentHash");
CREATE INDEX "AuditLog_sequenceNumber_idx" ON "AuditLog"("sequenceNumber");
CREATE INDEX "AuditLog_currentHash_idx" ON "AuditLog"("currentHash");
CREATE INDEX "AuditLog_previousHash_idx" ON "AuditLog"("previousHash");
CREATE INDEX "AuditLog_sourceAppKey_idx" ON "AuditLog"("sourceAppKey");
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");
CREATE INDEX "AuditLog_tenantOrgId_idx" ON "AuditLog"("tenantOrgId");
CREATE INDEX "AuditLog_actorHubUserId_idx" ON "AuditLog"("actorHubUserId");
CREATE INDEX "AuditLog_actorServiceId_idx" ON "AuditLog"("actorServiceId");
CREATE INDEX "AuditLog_suiteObjectReferenceId_idx" ON "AuditLog"("suiteObjectReferenceId");
CREATE INDEX "AuditLog_exportBatchId_idx" ON "AuditLog"("exportBatchId");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorServiceId_fkey"
  FOREIGN KEY ("actorServiceId") REFERENCES "ServiceIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_suiteObjectReferenceId_fkey"
  FOREIGN KEY ("suiteObjectReferenceId") REFERENCES "SuiteObjectReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SuiteObjectReference" ADD CONSTRAINT "SuiteObjectReference_sourceAppKey_fkey"
  FOREIGN KEY ("sourceAppKey") REFERENCES "AppRegistry"("appKey") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuiteObjectReference" ADD CONSTRAINT "SuiteObjectReference_owningAppKey_fkey"
  FOREIGN KEY ("owningAppKey") REFERENCES "AppRegistry"("appKey") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuiteObjectReference" ADD CONSTRAINT "SuiteObjectReference_tenantOrgId_fkey"
  FOREIGN KEY ("tenantOrgId") REFERENCES "CustomerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuiteObjectReference" ADD CONSTRAINT "SuiteObjectReference_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "CustomerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuiteObjectReference" ADD CONSTRAINT "SuiteObjectReference_createdByHubUserId_fkey"
  FOREIGN KEY ("createdByHubUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuiteObjectReference" ADD CONSTRAINT "SuiteObjectReference_createdByServiceId_fkey"
  FOREIGN KEY ("createdByServiceId") REFERENCES "ServiceIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuiteObjectReference" ADD CONSTRAINT "SuiteObjectReference_replacedByReferenceId_fkey"
  FOREIGN KEY ("replacedByReferenceId") REFERENCES "SuiteObjectReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "SuiteObjectReference" IS 'Hub durable cross-app object reference contract. Local apps remain owners of domain object details.';
COMMENT ON TABLE "AuditLog" IS 'Canonical Hub append-only, tamper-evident audit/event authority for MacTech Suite.';
COMMENT ON TABLE "AuditExportManifest" IS 'Signed manifest for a point-in-time export over canonical AuditLog rows.';

CREATE OR REPLACE FUNCTION "prevent_audit_log_update_delete"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only; % is forbidden', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_append_only_guard" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only_guard"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION "prevent_audit_log_update_delete"();
