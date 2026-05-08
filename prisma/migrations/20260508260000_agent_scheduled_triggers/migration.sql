-- Slice 5.8: scheduled triggers (saved Intent + cron expression →
-- automated AgentRun on schedule). Reuses the M2M external-trigger
-- service from slice 5.7 so the IBE safety story is identical.

CREATE TABLE IF NOT EXISTS "AgentTrigger" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "cronExpression" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "request" TEXT NOT NULL,
  "intentJson" JSONB NOT NULL,
  "autoExecute" BOOLEAN NOT NULL DEFAULT true,
  "lastFiredAt" TIMESTAMP(3),
  "nextFireAt" TIMESTAMP(3),
  "lastRunId" TEXT,
  "lastRunStatus" "AgentRunStatus",
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "createdByClerkUserId" TEXT NOT NULL,
  "createdByEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AgentTrigger_enabled_idx" ON "AgentTrigger"("enabled");
CREATE INDEX IF NOT EXISTS "AgentTrigger_nextFireAt_idx" ON "AgentTrigger"("nextFireAt");
CREATE INDEX IF NOT EXISTS "AgentTrigger_createdByClerkUserId_idx"
  ON "AgentTrigger"("createdByClerkUserId");
