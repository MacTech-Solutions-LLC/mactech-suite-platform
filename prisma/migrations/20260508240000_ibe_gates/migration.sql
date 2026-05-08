-- IBE Gates (Slice 5.5): adds the user-declared Intent contract to
-- AgentRun and the per-step invariant outcomes to AgentStep. See
-- docs/AGENT_OPS.md and /Users/patrick/IBE/README.md for the doctrine.

-- New AgentRunStatus value: refused (steps ran cleanly but invariants
-- did not hold).
DO $$ BEGIN
  ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'refused';
EXCEPTION WHEN others THEN null; END $$;

-- New enum: AgentRiskTolerance.
DO $$ BEGIN
  CREATE TYPE "AgentRiskTolerance" AS ENUM ('strict', 'moderate', 'permissive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AgentRun: add Intent columns.
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "intentGoal" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "intentRiskTolerance" "AgentRiskTolerance" NOT NULL DEFAULT 'strict';
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "intentScopeAppIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "intentScopeRepoIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "intentInvariantsJson" JSONB;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "intentValidationJson" JSONB;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "refusalReason" TEXT;

-- AgentStep: add invariant-result columns.
ALTER TABLE "AgentStep" ADD COLUMN IF NOT EXISTS "invariantResultsJson" JSONB;
ALTER TABLE "AgentStep" ADD COLUMN IF NOT EXISTS "invariantViolations" BOOLEAN NOT NULL DEFAULT false;
