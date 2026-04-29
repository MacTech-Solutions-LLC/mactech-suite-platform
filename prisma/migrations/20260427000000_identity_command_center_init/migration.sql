-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('mactech_super_admin', 'mactech_admin', 'mactech_support', 'mactech_auditor', 'mactech_read_only', 'none');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'invited');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('dib', 'prime', 'subcontractor', 'internal', 'other');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'onboarding', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('starter', 'professional', 'enterprise', 'federal');

-- CreateEnum
CREATE TYPE "CmmcLevel" AS ENUM ('level1', 'level2', 'unknown');

-- CreateEnum
CREATE TYPE "CuiBoundaryType" AS ENUM ('none', 'vault_only', 'customer_managed', 'hybrid');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('active', 'disabled', 'development');

-- CreateEnum
CREATE TYPE "AppCategory" AS ENUM ('vault', 'compliance', 'evidence', 'capture', 'reporting', 'admin', 'other');

-- CreateEnum
CREATE TYPE "EntitlementPlan" AS ENUM ('none', 'trial', 'starter', 'professional', 'enterprise', 'custom');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('active', 'trialing', 'expired', 'suspended');

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('auth', 'user', 'org', 'entitlement', 'role', 'security', 'vault', 'evidence', 'boundary', 'capture', 'system');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "SecuritySeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "SecurityEventStatus" AS ENUM ('open', 'investigating', 'resolved', 'ignored');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('platform', 'customer_org');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "isInternalMacTechUser" BOOLEAN NOT NULL DEFAULT false,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'none',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrganization" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "domain" TEXT,
    "cageCode" TEXT,
    "uei" TEXT,
    "duns" TEXT,
    "industry" TEXT,
    "customerType" "CustomerType" NOT NULL DEFAULT 'other',
    "status" "CustomerStatus" NOT NULL DEFAULT 'onboarding',
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'starter',
    "cmmcTargetLevel" "CmmcLevel" NOT NULL DEFAULT 'unknown',
    "cuiBoundaryType" "CuiBoundaryType" NOT NULL DEFAULT 'none',
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppRegistry" (
    "id" TEXT NOT NULL,
    "appKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseUrl" TEXT,
    "status" "AppStatus" NOT NULL DEFAULT 'active',
    "category" "AppCategory" NOT NULL DEFAULT 'other',
    "requiresOrgContext" BOOLEAN NOT NULL DEFAULT true,
    "isInternalOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEntitlement" (
    "id" TEXT NOT NULL,
    "customerOrganizationId" TEXT NOT NULL,
    "appRegistryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "plan" "EntitlementPlan" NOT NULL DEFAULT 'none',
    "maxUsers" INTEGER,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "EntitlementStatus" NOT NULL DEFAULT 'active',
    "configurationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUserAccess" (
    "id" TEXT NOT NULL,
    "customerOrganizationId" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "clerkMembershipId" TEXT,
    "role" TEXT NOT NULL,
    "permissionsJson" JSONB,
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgUserAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorClerkUserId" TEXT,
    "actorEmail" TEXT,
    "actorUserProfileId" TEXT,
    "customerOrganizationId" TEXT,
    "appRegistryId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventCategory" "AuditCategory" NOT NULL,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'info',
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerOrganizationId" TEXT,
    "actorClerkUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" "SecuritySeverity" NOT NULL DEFAULT 'low',
    "sourceAppKey" TEXT,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadataJson" JSONB,
    "status" "SecurityEventStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleTemplate" (
    "id" TEXT NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissionsJson" JSONB NOT NULL,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_externalId_key" ON "Tenant"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_externalId_idx" ON "Tenant"("externalId");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_isActive_idx" ON "Tenant"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_externalId_idx" ON "User"("externalId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_role_idx" ON "Membership"("role");

-- CreateIndex
CREATE INDEX "Membership_isActive_idx" ON "Membership"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_idx" ON "AuditEvent"("tenantId");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_idx" ON "AuditEvent"("userId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_entity_idx" ON "AuditEvent"("entity");

-- CreateIndex
CREATE INDEX "AuditEvent_timestamp_idx" ON "AuditEvent"("timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_timestamp_idx" ON "AuditEvent"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- CreateIndex
CREATE INDEX "Project_tenantId_status_idx" ON "Project"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE INDEX "Project_tenantId_createdAt_idx" ON "Project"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- CreateIndex
CREATE INDEX "Document_tenantId_status_idx" ON "Document"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Document_tenantId_createdAt_idx" ON "Document"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_clerkUserId_key" ON "UserProfile"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");

-- CreateIndex
CREATE INDEX "UserProfile_email_idx" ON "UserProfile"("email");

-- CreateIndex
CREATE INDEX "UserProfile_clerkUserId_idx" ON "UserProfile"("clerkUserId");

-- CreateIndex
CREATE INDEX "UserProfile_platformRole_idx" ON "UserProfile"("platformRole");

-- CreateIndex
CREATE INDEX "UserProfile_status_idx" ON "UserProfile"("status");

-- CreateIndex
CREATE INDEX "UserProfile_isInternalMacTechUser_idx" ON "UserProfile"("isInternalMacTechUser");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrganization_clerkOrgId_key" ON "CustomerOrganization"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrganization_slug_key" ON "CustomerOrganization"("slug");

-- CreateIndex
CREATE INDEX "CustomerOrganization_clerkOrgId_idx" ON "CustomerOrganization"("clerkOrgId");

-- CreateIndex
CREATE INDEX "CustomerOrganization_slug_idx" ON "CustomerOrganization"("slug");

-- CreateIndex
CREATE INDEX "CustomerOrganization_status_idx" ON "CustomerOrganization"("status");

-- CreateIndex
CREATE INDEX "CustomerOrganization_subscriptionTier_idx" ON "CustomerOrganization"("subscriptionTier");

-- CreateIndex
CREATE INDEX "CustomerOrganization_cmmcTargetLevel_idx" ON "CustomerOrganization"("cmmcTargetLevel");

-- CreateIndex
CREATE INDEX "CustomerOrganization_customerType_idx" ON "CustomerOrganization"("customerType");

-- CreateIndex
CREATE UNIQUE INDEX "AppRegistry_appKey_key" ON "AppRegistry"("appKey");

-- CreateIndex
CREATE INDEX "AppRegistry_appKey_idx" ON "AppRegistry"("appKey");

-- CreateIndex
CREATE INDEX "AppRegistry_status_idx" ON "AppRegistry"("status");

-- CreateIndex
CREATE INDEX "AppRegistry_category_idx" ON "AppRegistry"("category");

-- CreateIndex
CREATE INDEX "ProductEntitlement_customerOrganizationId_idx" ON "ProductEntitlement"("customerOrganizationId");

-- CreateIndex
CREATE INDEX "ProductEntitlement_appRegistryId_idx" ON "ProductEntitlement"("appRegistryId");

-- CreateIndex
CREATE INDEX "ProductEntitlement_status_idx" ON "ProductEntitlement"("status");

-- CreateIndex
CREATE INDEX "ProductEntitlement_enabled_idx" ON "ProductEntitlement"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEntitlement_customerOrganizationId_appRegistryId_key" ON "ProductEntitlement"("customerOrganizationId", "appRegistryId");

-- CreateIndex
CREATE INDEX "OrgUserAccess_customerOrganizationId_idx" ON "OrgUserAccess"("customerOrganizationId");

-- CreateIndex
CREATE INDEX "OrgUserAccess_userProfileId_idx" ON "OrgUserAccess"("userProfileId");

-- CreateIndex
CREATE INDEX "OrgUserAccess_status_idx" ON "OrgUserAccess"("status");

-- CreateIndex
CREATE INDEX "OrgUserAccess_role_idx" ON "OrgUserAccess"("role");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUserAccess_customerOrganizationId_userProfileId_key" ON "OrgUserAccess"("customerOrganizationId", "userProfileId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_eventCategory_idx" ON "AuditLog"("eventCategory");

-- CreateIndex
CREATE INDEX "AuditLog_severity_idx" ON "AuditLog"("severity");

-- CreateIndex
CREATE INDEX "AuditLog_eventType_idx" ON "AuditLog"("eventType");

-- CreateIndex
CREATE INDEX "AuditLog_customerOrganizationId_idx" ON "AuditLog"("customerOrganizationId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserProfileId_idx" ON "AuditLog"("actorUserProfileId");

-- CreateIndex
CREATE INDEX "AuditLog_actorClerkUserId_idx" ON "AuditLog"("actorClerkUserId");

-- CreateIndex
CREATE INDEX "AuditLog_appRegistryId_idx" ON "AuditLog"("appRegistryId");

-- CreateIndex
CREATE INDEX "AuditLog_customerOrganizationId_timestamp_idx" ON "AuditLog"("customerOrganizationId", "timestamp");

-- CreateIndex
CREATE INDEX "SecurityEvent_timestamp_idx" ON "SecurityEvent"("timestamp");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_idx" ON "SecurityEvent"("severity");

-- CreateIndex
CREATE INDEX "SecurityEvent_status_idx" ON "SecurityEvent"("status");

-- CreateIndex
CREATE INDEX "SecurityEvent_customerOrganizationId_idx" ON "SecurityEvent"("customerOrganizationId");

-- CreateIndex
CREATE INDEX "SecurityEvent_sourceAppKey_idx" ON "SecurityEvent"("sourceAppKey");

-- CreateIndex
CREATE INDEX "RoleTemplate_scope_idx" ON "RoleTemplate"("scope");

-- CreateIndex
CREATE INDEX "RoleTemplate_isSystemRole_idx" ON "RoleTemplate"("isSystemRole");

-- CreateIndex
CREATE UNIQUE INDEX "RoleTemplate_scope_key_key" ON "RoleTemplate"("scope", "key");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEntitlement" ADD CONSTRAINT "ProductEntitlement_customerOrganizationId_fkey" FOREIGN KEY ("customerOrganizationId") REFERENCES "CustomerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEntitlement" ADD CONSTRAINT "ProductEntitlement_appRegistryId_fkey" FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUserAccess" ADD CONSTRAINT "OrgUserAccess_customerOrganizationId_fkey" FOREIGN KEY ("customerOrganizationId") REFERENCES "CustomerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUserAccess" ADD CONSTRAINT "OrgUserAccess_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserProfileId_fkey" FOREIGN KEY ("actorUserProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_customerOrganizationId_fkey" FOREIGN KEY ("customerOrganizationId") REFERENCES "CustomerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_appRegistryId_fkey" FOREIGN KEY ("appRegistryId") REFERENCES "AppRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_customerOrganizationId_fkey" FOREIGN KEY ("customerOrganizationId") REFERENCES "CustomerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

