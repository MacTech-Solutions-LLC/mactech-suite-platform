-- Fix: at-most-one-OPEN-per-(app,category) → partial unique index.
--
-- The original constraint UNIQUE(appRegistryId, category, status) was wrong:
-- it forbade more than one RESOLVED or ACKNOWLEDGED row per (app, category),
-- which breaks the lifecycle pattern in lib/services/command-center/risk-service.ts
-- where a flag legitimately resolves, a new condition opens a fresh OPEN row,
-- and that row eventually resolves too — at which point the second .update()
-- to status='resolved' violates the (app, cat, resolved) unique. Prisma raises
-- P2002 on update, the /command-center page render crashes.
--
-- The schema-level comment ("at most one OPEN flag of a given (app, category)
-- pair") was correct; the constraint as written was overbroad. Replace it with
-- a Postgres partial unique index that only enforces the invariant on rows
-- where status='open'. Resolved/acknowledged/ignored rows are free to stack
-- so the historical audit trail can grow indefinitely.

DROP INDEX IF EXISTS "OperationalRiskFlag_appRegistryId_category_status_key";

CREATE UNIQUE INDEX IF NOT EXISTS "OperationalRiskFlag_open_per_app_category_uniq"
  ON "OperationalRiskFlag" ("appRegistryId", "category")
  WHERE "status" = 'open'::"RiskStatus";

-- Keep the (app, category) lookup performant for the reconciler's findMany
-- that filters by appRegistryId + status='open' + category IN (...). The
-- partial unique index above already covers that exact predicate, so no
-- additional index is required.
