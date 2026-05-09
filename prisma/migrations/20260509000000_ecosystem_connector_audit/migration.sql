-- Slice 5.9: ecosystem connector audit. Backfills the AppDependency
-- rows that the original Slice 4 seed missed:
--   * audit-ingest fanout for cleard / opportunities / proposal /
--     vetted / mactech-core (5 rows)
--   * Suite-as-registry fanout for the same 5 apps (5 rows)
--   * webhook_source edges for every app with a repoFullName except
--     identity-command-center (10 rows). For training / quality /
--     governance the description includes Railway too — they're the
--     three non-self projects with Railway webhooks configured.
--
-- Schema-level: zero changes. This is a pure data migration. Idempotent
-- via the (source, target, dependencyType) unique key.

-- Helper: insert a dependency identified by source/target appKey lookups.
-- Uses ON CONFLICT against the unique key so re-running a deploy is safe.
DO $$
DECLARE
  src_id TEXT;
  tgt_id TEXT;
  pair RECORD;
  pairs CONSTANT JSONB := '[
    {"src":"cleard","tgt":"identity-command-center","type":"api_calls","desc":"POST /api/audit/ingest","crit":"medium"},
    {"src":"opportunities","tgt":"identity-command-center","type":"api_calls","desc":"POST /api/audit/ingest","crit":"medium"},
    {"src":"proposal","tgt":"identity-command-center","type":"api_calls","desc":"POST /api/audit/ingest","crit":"medium"},
    {"src":"vetted","tgt":"identity-command-center","type":"api_calls","desc":"POST /api/audit/ingest","crit":"medium"},
    {"src":"mactech-core","tgt":"identity-command-center","type":"api_calls","desc":"POST /api/audit/ingest","crit":"medium"},

    {"src":"identity-command-center","tgt":"cleard","type":"shared_component","desc":"Suite tracks cleard in AppRegistry + entitlements","crit":"medium"},
    {"src":"identity-command-center","tgt":"opportunities","type":"shared_component","desc":"Suite tracks opportunities in AppRegistry + entitlements","crit":"medium"},
    {"src":"identity-command-center","tgt":"proposal","type":"shared_component","desc":"Suite tracks proposal in AppRegistry + entitlements","crit":"medium"},
    {"src":"identity-command-center","tgt":"vetted","type":"shared_component","desc":"Suite tracks vetted in AppRegistry + entitlements","crit":"medium"},
    {"src":"identity-command-center","tgt":"mactech-core","type":"shared_component","desc":"Suite tracks mactech-core in AppRegistry + entitlements","crit":"low"},

    {"src":"capture","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub push + workflow_run → /api/webhooks/github","crit":"high"},
    {"src":"codex","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub push + workflow_run → /api/webhooks/github","crit":"high"},
    {"src":"training","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub + Railway lifecycle webhooks → Suite ingest","crit":"high"},
    {"src":"quality","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub + Railway lifecycle webhooks → Suite ingest","crit":"high"},
    {"src":"governance","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub + Railway lifecycle webhooks → Suite ingest","crit":"high"},
    {"src":"enclavewatch","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub push + workflow_run → /api/webhooks/github","crit":"high"},
    {"src":"opportunities","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub push + workflow_run → /api/webhooks/github","crit":"medium"},
    {"src":"proposal","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub push + workflow_run → /api/webhooks/github","crit":"medium"},
    {"src":"vetted","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub push + workflow_run → /api/webhooks/github","crit":"medium"},
    {"src":"mactech-core","tgt":"identity-command-center","type":"webhook_source","desc":"GitHub push + workflow_run → /api/webhooks/github","crit":"low"}
  ]'::jsonb;
BEGIN
  FOR pair IN SELECT * FROM jsonb_to_recordset(pairs)
    AS x(src TEXT, tgt TEXT, type TEXT, "desc" TEXT, crit TEXT)
  LOOP
    SELECT id INTO src_id FROM "AppRegistry" WHERE "appKey" = pair.src LIMIT 1;
    SELECT id INTO tgt_id FROM "AppRegistry" WHERE "appKey" = pair.tgt LIMIT 1;
    IF src_id IS NULL OR tgt_id IS NULL THEN
      RAISE NOTICE 'Skipping dependency %s -> %s: appKey not found', pair.src, pair.tgt;
      CONTINUE;
    END IF;
    INSERT INTO "AppDependency" (
      "id",
      "sourceAppRegistryId",
      "targetAppRegistryId",
      "dependencyType",
      "description",
      "criticality",
      "createdAt",
      "updatedAt"
    ) VALUES (
      gen_random_uuid()::text,
      src_id,
      tgt_id,
      pair.type::"AppDependencyType",
      pair."desc",
      pair.crit::"AppCriticality",
      NOW(),
      NOW()
    )
    ON CONFLICT ("sourceAppRegistryId", "targetAppRegistryId", "dependencyType") DO NOTHING;
  END LOOP;
END $$;
