-- Hub Authority Contract v1
-- Canonical runtime authority remains UserProfile, CustomerOrganization,
-- OrgUserAccess, ProductEntitlement, AppRegistry, RoleTemplate, AuditLog,
-- SecurityEvent, ApiKey, and ServiceIdentity.

ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'inactive';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'revoked';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'deleted';

ALTER TYPE "CustomerStatus" ADD VALUE IF NOT EXISTS 'inactive';
ALTER TYPE "CustomerStatus" ADD VALUE IF NOT EXISTS 'unpaid';

ALTER TYPE "AppStatus" ADD VALUE IF NOT EXISTS 'inactive';
ALTER TYPE "AppStatus" ADD VALUE IF NOT EXISTS 'hidden';
ALTER TYPE "AppStatus" ADD VALUE IF NOT EXISTS 'suspended';

ALTER TYPE "ApiKeyScope" ADD VALUE IF NOT EXISTS 'app_authority_resolve';

CREATE TYPE "ServiceIdentityStatus" AS ENUM ('active', 'suspended', 'retired');

ALTER TABLE "UserProfile" ADD COLUMN "authorityVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CustomerOrganization" ADD COLUMN "authorityVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AppRegistry" ADD COLUMN "authorityVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ProductEntitlement" ADD COLUMN "authorityVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "OrgUserAccess" ADD COLUMN "authorityVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ServiceIdentity" (
  "id" TEXT NOT NULL,
  "appKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ServiceIdentityStatus" NOT NULL DEFAULT 'active',
  "tokenRotatedAt" TIMESTAMP(3),
  "tokenExpiresAt" TIMESTAMP(3),
  "lastAuthenticatedAt" TIMESTAMP(3),
  "authorityVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceIdentity_appKey_key" ON "ServiceIdentity"("appKey");
CREATE INDEX "ServiceIdentity_appKey_idx" ON "ServiceIdentity"("appKey");
CREATE INDEX "ServiceIdentity_status_idx" ON "ServiceIdentity"("status");

COMMENT ON TABLE "Tenant" IS 'DEPRECATED Hub Authority Contract v1 compatibility table. Do not use as Suite runtime authority.';
COMMENT ON TABLE "User" IS 'DEPRECATED Hub Authority Contract v1 compatibility table. Use UserProfile as canonical user authority.';
COMMENT ON TABLE "Membership" IS 'DEPRECATED Hub Authority Contract v1 compatibility table. Use OrgUserAccess as canonical membership authority.';
COMMENT ON TABLE "AuditEvent" IS 'DEPRECATED Hub Authority Contract v1 compatibility table. Use AuditLog and SecurityEvent as canonical audit/event authority.';
