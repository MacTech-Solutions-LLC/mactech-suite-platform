-- CreateEnum
CREATE TYPE "ContractStage" AS ENUM ('PIPELINE', 'PROPOSAL', 'NEGOTIATION', 'ACTIVE', 'MOD', 'OPTION', 'CLOSEOUT');

-- CreateEnum
CREATE TYPE "ContractMembershipRole" AS ENUM ('OWNER', 'CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ContractActorType" AS ENUM ('USER', 'INTEGRATION', 'SYSTEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApiKeyScope" ADD VALUE 'contract_read';
ALTER TYPE "ApiKeyScope" ADD VALUE 'contract_write';

-- AlterEnum
ALTER TYPE "AuditCategory" ADD VALUE 'contract';

-- DropForeignKey
ALTER TABLE "AppDependency" DROP CONSTRAINT "AppDependency_sourceAppRegistryId_fkey";

-- DropForeignKey
ALTER TABLE "AppDependency" DROP CONSTRAINT "AppDependency_targetAppRegistryId_fkey";

-- DropForeignKey
ALTER TABLE "AppRepositoryLink" DROP CONSTRAINT "AppRepositoryLink_appRegistryId_fkey";

-- DropForeignKey
ALTER TABLE "AppRepositoryLink" DROP CONSTRAINT "AppRepositoryLink_gitRepositoryId_fkey";

-- DropForeignKey
ALTER TABLE "CommitSummary" DROP CONSTRAINT "CommitSummary_appRegistryId_fkey";

-- DropForeignKey
ALTER TABLE "DeploymentSnapshot" DROP CONSTRAINT "DeploymentSnapshot_appRegistryId_fkey";

-- DropForeignKey
ALTER TABLE "DeploymentSnapshot" DROP CONSTRAINT "DeploymentSnapshot_railwayResourceId_fkey";

-- DropForeignKey
ALTER TABLE "GitCommitEvent" DROP CONSTRAINT "GitCommitEvent_gitRepositoryId_fkey";

-- DropForeignKey
ALTER TABLE "GitWorkflowRun" DROP CONSTRAINT "GitWorkflowRun_gitRepositoryId_fkey";

-- DropForeignKey
ALTER TABLE "HealthCheckSnapshot" DROP CONSTRAINT "HealthCheckSnapshot_appRegistryId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationEvent" DROP CONSTRAINT "IntegrationEvent_appRegistryId_fkey";

-- DropForeignKey
ALTER TABLE "OperationalRiskFlag" DROP CONSTRAINT "OperationalRiskFlag_appRegistryId_fkey";

-- DropForeignKey
ALTER TABLE "RailwayResource" DROP CONSTRAINT "RailwayResource_appRegistryId_fkey";

-- DropIndex
DROP INDEX "AgentRun_triggeredByApiKeyId_idx";

-- AlterTable
ALTER TABLE "AgentRun" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AgentStep" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AgentTrigger" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stage" "ContractStage" NOT NULL DEFAULT 'PIPELINE',
    "awardDate" TIMESTAMP(3),
    "farClause" TEXT,
    "satelliteRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractMembership" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "role" "ContractMembershipRole" NOT NULL DEFAULT 'VIEWER',
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLifecycleEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fromStage" "ContractStage",
    "toStage" "ContractStage" NOT NULL,
    "actorId" TEXT,
    "actorType" "ContractActorType" NOT NULL DEFAULT 'SYSTEM',
    "evidenceRef" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ContractLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_organizationId_idx" ON "Contract"("organizationId");

-- CreateIndex
CREATE INDEX "Contract_organizationId_stage_idx" ON "Contract"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "Contract_awardDate_idx" ON "Contract"("awardDate");

-- CreateIndex
CREATE INDEX "Contract_createdAt_idx" ON "Contract"("createdAt");

-- CreateIndex
CREATE INDEX "ContractMembership_contractId_idx" ON "ContractMembership"("contractId");

-- CreateIndex
CREATE INDEX "ContractMembership_userProfileId_idx" ON "ContractMembership"("userProfileId");

-- CreateIndex
CREATE INDEX "ContractMembership_role_idx" ON "ContractMembership"("role");

-- CreateIndex
CREATE UNIQUE INDEX "ContractMembership_contractId_userProfileId_key" ON "ContractMembership"("contractId", "userProfileId");

-- CreateIndex
CREATE INDEX "ContractLifecycleEvent_contractId_idx" ON "ContractLifecycleEvent"("contractId");

-- CreateIndex
CREATE INDEX "ContractLifecycleEvent_contractId_toStage_idx" ON "ContractLifecycleEvent"("contractId", "toStage");

-- CreateIndex
CREATE INDEX "ContractLifecycleEvent_occurredAt_idx" ON "ContractLifecycleEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "ContractLifecycleEvent_actorId_idx" ON "ContractLifecycleEvent"("actorId");

-- CreateIndex
CREATE INDEX "AppRegistry_slug_idx" ON "AppRegistry"("slug");

-- CreateIndex
CREATE INDEX "OperationalRiskFlag_appRegistryId_category_idx" ON "OperationalRiskFlag"("appRegistryId", "category");

-- AddForeignKey
ALTER TABLE "HealthCheckSnapshot" ADD CONSTRAINT "HealthCheckSnapshot_appRegistryId_fkey" FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRiskFlag" ADD CONSTRAINT "OperationalRiskFlag_appRegistryId_fkey" FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_appRegistryId_fkey" FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRepositoryLink" ADD CONSTRAINT "AppRepositoryLink_appRegistryId_fkey" FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRepositoryLink" ADD CONSTRAINT "AppRepositoryLink_gitRepositoryId_fkey" FOREIGN KEY ("gitRepositoryId") REFERENCES "GitRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitCommitEvent" ADD CONSTRAINT "GitCommitEvent_gitRepositoryId_fkey" FOREIGN KEY ("gitRepositoryId") REFERENCES "GitRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitWorkflowRun" ADD CONSTRAINT "GitWorkflowRun_gitRepositoryId_fkey" FOREIGN KEY ("gitRepositoryId") REFERENCES "GitRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RailwayResource" ADD CONSTRAINT "RailwayResource_appRegistryId_fkey" FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentSnapshot" ADD CONSTRAINT "DeploymentSnapshot_appRegistryId_fkey" FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentSnapshot" ADD CONSTRAINT "DeploymentSnapshot_railwayResourceId_fkey" FOREIGN KEY ("railwayResourceId") REFERENCES "RailwayResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitSummary" ADD CONSTRAINT "CommitSummary_appRegistryId_fkey" FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppDependency" ADD CONSTRAINT "AppDependency_sourceAppRegistryId_fkey" FOREIGN KEY ("sourceAppRegistryId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppDependency" ADD CONSTRAINT "AppDependency_targetAppRegistryId_fkey" FOREIGN KEY ("targetAppRegistryId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "CustomerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMembership" ADD CONSTRAINT "ContractMembership_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMembership" ADD CONSTRAINT "ContractMembership_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMembership" ADD CONSTRAINT "ContractMembership_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLifecycleEvent" ADD CONSTRAINT "ContractLifecycleEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLifecycleEvent" ADD CONSTRAINT "ContractLifecycleEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "AppDependency_sourceAppRegistryId_targetAppRegistryId_dependenc" RENAME TO "AppDependency_sourceAppRegistryId_targetAppRegistryId_depen_key";

-- RenameIndex
ALTER INDEX "SuiteObjectReference_owningAppKey_objectType_objectId_objectVer" RENAME TO "SuiteObjectReference_owningAppKey_objectType_objectId_objec_key";
