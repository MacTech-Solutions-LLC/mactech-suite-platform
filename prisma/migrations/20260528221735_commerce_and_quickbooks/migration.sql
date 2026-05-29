-- Phase 1: commerce + QuickBooks Online integration.
-- Adds Package, Order, Subscription, Payment, QuickbooksConnection,
-- QuickbooksWebhookEvent + supporting enums. No changes to pre-existing
-- tables beyond two new FK columns on Order pointing at Package /
-- CustomerOrganization.
--
-- All CREATE TYPE statements use DO blocks so the migration is idempotent
-- on retry (Postgres CREATE TYPE has no IF NOT EXISTS). SubscriptionTier
-- is also created here: the live DB has it as a TEXT column on
-- CustomerOrganization despite the schema declaring it as an enum, so
-- the type itself is missing and Package.entitlementTier needs it.

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "SubscriptionTier" AS ENUM ('starter', 'professional', 'enterprise', 'federal');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "BillingCycle" AS ENUM ('one_time', 'monthly', 'quarterly', 'annually');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "PackageStatus" AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('pending', 'payment_pending', 'paid', 'provisioned', 'failed', 'refunded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'cancelled', 'paused');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "QuickbooksEnvironment" AS ENUM ('sandbox', 'production');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "QuickbooksWebhookStatus" AS ENUM ('received', 'processing', 'processed', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingCycle" "BillingCycle" NOT NULL,
    "qboItemId" TEXT,
    "entitlementTier" "SubscriptionTier" NOT NULL DEFAULT 'starter',
    "includedAppKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PackageStatus" NOT NULL DEFAULT 'draft',
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerName" TEXT,
    "buyerCompany" TEXT,
    "packageId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "qboCustomerId" TEXT,
    "qboInvoiceId" TEXT,
    "qboInvoiceDocNumber" TEXT,
    "qboPaymentLinkUrl" TEXT,
    "customerOrganizationId" TEXT,
    "metadataJson" JSONB,
    "placedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "provisionedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "customerOrganizationId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "orderId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "qboRecurringTransactionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "qboPaymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "capturedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickbooksConnection" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "environment" "QuickbooksEnvironment" NOT NULL DEFAULT 'sandbox',
    "accessTokenCipher" TEXT NOT NULL,
    "refreshTokenCipher" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "companyName" TEXT,
    "connectedByClerkUserId" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickbooksConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickbooksWebhookEvent" (
    "id" TEXT NOT NULL,
    "intuitEventId" TEXT,
    "realmId" TEXT,
    "eventType" TEXT,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "QuickbooksWebhookStatus" NOT NULL DEFAULT 'received',
    "payloadJson" JSONB NOT NULL,
    "rawBody" TEXT,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "QuickbooksWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Package_sku_key" ON "Package"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Package_qboItemId_key" ON "Package"("qboItemId");

-- CreateIndex
CREATE INDEX "Package_status_idx" ON "Package"("status");

-- CreateIndex
CREATE INDEX "Package_billingCycle_idx" ON "Package"("billingCycle");

-- CreateIndex
CREATE UNIQUE INDEX "Order_qboInvoiceId_key" ON "Order"("qboInvoiceId");

-- CreateIndex
CREATE INDEX "Order_buyerEmail_idx" ON "Order"("buyerEmail");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_packageId_idx" ON "Order"("packageId");

-- CreateIndex
CREATE INDEX "Order_customerOrganizationId_idx" ON "Order"("customerOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_orderId_key" ON "Subscription"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_qboRecurringTransactionId_key" ON "Subscription"("qboRecurringTransactionId");

-- CreateIndex
CREATE INDEX "Subscription_customerOrganizationId_idx" ON "Subscription"("customerOrganizationId");

-- CreateIndex
CREATE INDEX "Subscription_packageId_idx" ON "Subscription"("packageId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_qboPaymentId_key" ON "Payment"("qboPaymentId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "QuickbooksConnection_realmId_key" ON "QuickbooksConnection"("realmId");

-- CreateIndex
CREATE INDEX "QuickbooksConnection_isActive_idx" ON "QuickbooksConnection"("isActive");

-- CreateIndex
CREATE INDEX "QuickbooksConnection_environment_idx" ON "QuickbooksConnection"("environment");

-- CreateIndex
CREATE UNIQUE INDEX "QuickbooksWebhookEvent_intuitEventId_key" ON "QuickbooksWebhookEvent"("intuitEventId");

-- CreateIndex
CREATE INDEX "QuickbooksWebhookEvent_status_idx" ON "QuickbooksWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "QuickbooksWebhookEvent_receivedAt_idx" ON "QuickbooksWebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "QuickbooksWebhookEvent_realmId_idx" ON "QuickbooksWebhookEvent"("realmId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerOrganizationId_fkey" FOREIGN KEY ("customerOrganizationId") REFERENCES "CustomerOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_customerOrganizationId_fkey" FOREIGN KEY ("customerOrganizationId") REFERENCES "CustomerOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
