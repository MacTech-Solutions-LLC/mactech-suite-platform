-- AgentOps (Slice 5): persistence for natural-language → plan → human
-- approval → executed run. The capability registry itself is code-defined
-- (lib/agents/capabilities) and not stored in the DB on purpose: that
-- prevents "approved capabilities" from being widened by an unauthorized
-- DB write. The DB only persists runs, steps the planner produced,
-- artifacts, and approval/rejection events.

-- Enums (idempotent).
DO $$ BEGIN
  CREATE TYPE "AgentRunStatus" AS ENUM (
    'planned', 'awaiting_approval', 'approved', 'rejected',
    'running', 'completed', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentStepStatus" AS ENUM (
    'planned', 'skipped', 'running', 'succeeded', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentStepKind" AS ENUM ('read_only', 'approval_required');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentApprovalDecision" AS ENUM ('approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentArtifactKind" AS ENUM (
    'release_notes', 'draft_pr_description', 'github_issue_body',
    'audit_summary', 'risk_summary', 'deployment_drift_summary',
    'app_status_summary', 'health_summary', 'raw_json', 'markdown'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AgentRun.
CREATE TABLE IF NOT EXISTS "AgentRun" (
  "id" TEXT PRIMARY KEY,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'planned',
  "requestText" TEXT NOT NULL,
  "planSummary" TEXT,
  "deterministicPlan" BOOLEAN NOT NULL DEFAULT false,
  "plannedStepCount" INTEGER NOT NULL DEFAULT 0,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "requestedByClerkUserId" TEXT NOT NULL,
  "requestedByEmail" TEXT NOT NULL,
  "approvedByClerkUserId" TEXT,
  "approvedByEmail" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AgentRun_status_idx" ON "AgentRun"("status");
CREATE INDEX IF NOT EXISTS "AgentRun_requestedByClerkUserId_idx" ON "AgentRun"("requestedByClerkUserId");
CREATE INDEX IF NOT EXISTS "AgentRun_createdAt_idx" ON "AgentRun"("createdAt");
CREATE INDEX IF NOT EXISTS "AgentRun_status_createdAt_idx" ON "AgentRun"("status", "createdAt");

-- AgentStep.
CREATE TABLE IF NOT EXISTS "AgentStep" (
  "id" TEXT PRIMARY KEY,
  "agentRunId" TEXT NOT NULL,
  "stepIndex" INTEGER NOT NULL,
  "capabilityKey" TEXT NOT NULL,
  "capabilityVersion" INTEGER NOT NULL DEFAULT 1,
  "kind" "AgentStepKind" NOT NULL,
  "status" "AgentStepStatus" NOT NULL DEFAULT 'planned',
  "rationale" TEXT,
  "inputJson" JSONB NOT NULL,
  "outputJson" JSONB,
  "auditLogId" TEXT,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgentStep_agentRunId_stepIndex_key" ON "AgentStep"("agentRunId", "stepIndex");
CREATE INDEX IF NOT EXISTS "AgentStep_agentRunId_idx" ON "AgentStep"("agentRunId");
CREATE INDEX IF NOT EXISTS "AgentStep_capabilityKey_idx" ON "AgentStep"("capabilityKey");
CREATE INDEX IF NOT EXISTS "AgentStep_status_idx" ON "AgentStep"("status");

DO $$ BEGIN
  ALTER TABLE "AgentStep"
    ADD CONSTRAINT "AgentStep_agentRunId_fkey"
    FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AgentArtifact.
CREATE TABLE IF NOT EXISTS "AgentArtifact" (
  "id" TEXT PRIMARY KEY,
  "agentRunId" TEXT NOT NULL,
  "agentStepId" TEXT,
  "kind" "AgentArtifactKind" NOT NULL,
  "title" TEXT NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AgentArtifact_agentRunId_idx" ON "AgentArtifact"("agentRunId");
CREATE INDEX IF NOT EXISTS "AgentArtifact_kind_idx" ON "AgentArtifact"("kind");

DO $$ BEGIN
  ALTER TABLE "AgentArtifact"
    ADD CONSTRAINT "AgentArtifact_agentRunId_fkey"
    FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AgentApproval.
CREATE TABLE IF NOT EXISTS "AgentApproval" (
  "id" TEXT PRIMARY KEY,
  "agentRunId" TEXT NOT NULL,
  "decision" "AgentApprovalDecision" NOT NULL,
  "approverClerkUserId" TEXT NOT NULL,
  "approverEmail" TEXT NOT NULL,
  "scopeReductionJson" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AgentApproval_agentRunId_idx" ON "AgentApproval"("agentRunId");
CREATE INDEX IF NOT EXISTS "AgentApproval_approverClerkUserId_idx" ON "AgentApproval"("approverClerkUserId");
CREATE INDEX IF NOT EXISTS "AgentApproval_decision_idx" ON "AgentApproval"("decision");

DO $$ BEGIN
  ALTER TABLE "AgentApproval"
    ADD CONSTRAINT "AgentApproval_agentRunId_fkey"
    FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
