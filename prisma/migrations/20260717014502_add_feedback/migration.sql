-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('bug', 'ux', 'feature', 'general');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('new', 'acknowledged', 'dispatched', 'resolved', 'dismissed');

-- NOTE: `prisma migrate dev` also proposed dropping the AuditLog
-- sequenceNumber sequence + default here (a pre-existing schema↔DB
-- divergence from commit d1c5f70). That drop is intentionally deferred by
-- the team — see 20260716050000_member_capability_profile where the same
-- two lines are commented out — so it is deliberately omitted from this
-- feedback migration.

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL DEFAULT 'general',
    "status" "FeedbackStatus" NOT NULL DEFAULT 'new',
    "content" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "elementSelector" TEXT,
    "elementId" TEXT,
    "elementClass" TEXT,
    "elementText" TEXT,
    "elementType" TEXT,
    "submittedBy" TEXT,
    "userAgent" TEXT,
    "agentRunId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedByEmail" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_category_idx" ON "Feedback"("category");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_agentRunId_idx" ON "Feedback"("agentRunId");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
