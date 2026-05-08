-- Slice 5.7: external Claude / automation trigger for AgentOps runs.
-- Adds a new ApiKeyScope (`agents_trigger`) and trigger-source columns
-- on AgentRun so M2M-driven runs are visibly distinct from browser-
-- initiated ones. Safety contract: IBE gates apply identically to both
-- entry points; M2M-triggered runs whose plan contains any
-- approval_required step still require a human admin to approve via
-- /admin/agents/[id] (separation of duties preserved because the M2M
-- "requester" identity is api-key:<id>, never matches a Clerk user).

DO $$ BEGIN
  ALTER TYPE "ApiKeyScope" ADD VALUE IF NOT EXISTS 'agents_trigger';
EXCEPTION WHEN others THEN null; END $$;

ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "triggeredByApiKeyId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "triggeredByApiKeyName" TEXT;

CREATE INDEX IF NOT EXISTS "AgentRun_triggeredByApiKeyId_idx"
  ON "AgentRun"("triggeredByApiKeyId");
