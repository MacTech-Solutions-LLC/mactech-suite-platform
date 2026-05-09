-- Slice 8.1: backfill Railway IDs for the mactech-core app so the
-- per-app token routing in lib/integrations/railway/token-routing.ts
-- can drive sync against the standalone "MacTech Solutions" Railway
-- project (project token: RAILWAY_API_TOKEN_MACTECH).
--
-- Project: 72740679-75b1-4b1d-b0ec-0fbee4b7a710
-- Service: e9be0da9-41c9-4052-a36d-c58b5f5a579f  (the "mactech" app)
-- Env:     2e5bc7ae-ebfb-4423-8102-7bf1bfa1c588  (production)
--
-- Idempotent: only updates when ALL three columns are still null
-- (i.e. nothing else has populated them since). Won't overwrite a
-- runtime sync's values if one slipped in between deploy + migration.

UPDATE "AppRegistry"
SET
  "railwayProjectId" = '72740679-75b1-4b1d-b0ec-0fbee4b7a710',
  "railwayServiceId" = 'e9be0da9-41c9-4052-a36d-c58b5f5a579f',
  "railwayEnvironmentId" = '2e5bc7ae-ebfb-4423-8102-7bf1bfa1c588',
  "railwayEnvironmentName" = 'production'
WHERE "appKey" = 'mactech-core'
  AND "railwayProjectId" IS NULL
  AND "railwayServiceId" IS NULL
  AND "railwayEnvironmentId" IS NULL;
