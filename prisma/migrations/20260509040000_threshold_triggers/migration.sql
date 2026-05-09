-- Slice 9: threshold-based triggers. AgentTrigger gains a kind
-- discriminator (cron | threshold) plus the metric/operator/value
-- triple a threshold trigger needs. Cron triggers are unchanged
-- semantically; their `kind` defaults to 'cron' for the migration
-- backfill.
--
-- Schema changes:
--   * New enum AgentTriggerKind (cron | threshold)
--   * New enum ThresholdOperator (gt | gte | lt | lte | eq | ne)
--   * AgentTrigger.kind, .thresholdMetric, .thresholdOperator,
--     .thresholdValue, .thresholdLastValue, .thresholdConditionMet,
--     .cooldownMinutes
--   * AgentTrigger.cronExpression becomes nullable (threshold
--     triggers don't have one)

DO $$ BEGIN
  CREATE TYPE "AgentTriggerKind" AS ENUM ('cron', 'threshold');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ThresholdOperator" AS ENUM ('gt', 'gte', 'lt', 'lte', 'eq', 'ne');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "AgentTrigger" ADD COLUMN IF NOT EXISTS "kind" "AgentTriggerKind" NOT NULL DEFAULT 'cron';
ALTER TABLE "AgentTrigger" ADD COLUMN IF NOT EXISTS "thresholdMetric" TEXT;
ALTER TABLE "AgentTrigger" ADD COLUMN IF NOT EXISTS "thresholdOperator" "ThresholdOperator";
ALTER TABLE "AgentTrigger" ADD COLUMN IF NOT EXISTS "thresholdValue" DOUBLE PRECISION;
ALTER TABLE "AgentTrigger" ADD COLUMN IF NOT EXISTS "thresholdLastValue" DOUBLE PRECISION;
ALTER TABLE "AgentTrigger" ADD COLUMN IF NOT EXISTS "thresholdConditionMet" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentTrigger" ADD COLUMN IF NOT EXISTS "cooldownMinutes" INTEGER NOT NULL DEFAULT 60;

-- cronExpression was NOT NULL; relax to nullable so threshold
-- triggers don't need a fake cron string. Existing cron triggers
-- already have non-null values so no data migration needed.
ALTER TABLE "AgentTrigger" ALTER COLUMN "cronExpression" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "AgentTrigger_kind_enabled_idx" ON "AgentTrigger"("kind", "enabled");
