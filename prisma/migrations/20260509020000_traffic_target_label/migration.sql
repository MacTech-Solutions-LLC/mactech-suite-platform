-- Slice 6.1: end-to-end traffic instrumentation. Adds targetLabel to
-- AppCallEvent so outbound calls Suite makes (Suite → GitHub / Railway
-- / OpenAI) are symmetric with the inbound rows captured in slice 6
-- (Suite-bound only). Default of "identity-command-center" backfills
-- existing rows since slice 6 only recorded Suite-bound traffic.

ALTER TABLE "AppCallEvent" ADD COLUMN IF NOT EXISTS "targetLabel" TEXT NOT NULL DEFAULT 'identity-command-center';

CREATE INDEX IF NOT EXISTS "AppCallEvent_targetLabel_occurredAt_idx"
  ON "AppCallEvent"("targetLabel", "occurredAt" DESC);
