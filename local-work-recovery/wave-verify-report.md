# Previous-Wave Verification Report (Agent V)

- Date: 2026-06-11 (UTC-4)
- Mode: Pre-tenant speed mode — audit only, no fixes applied
- Repos audited:
  - `mactech-suite-platform` @ `suite-workflow-vnext-contract` (HEAD `e98e982`)
  - `bizops` @ `agent/suite-uniformity-phase-b`
  - `contracts-delivery` @ `feat/hub-contract-data-layer`
- Proposal repo: NOT touched (per hard rules)

## PASS/FAIL Matrix

| # | Check | hub (mactech-suite-platform) | bizops | contracts-delivery |
|---|-------|------------------------------|--------|--------------------|
| 1 | Migration dir exists & committed | PASS | PASS | PASS |
| 1a | Required CREATE TABLE / constraints content | PASS | PASS (3 CREATE TABLE) | PASS (3 CREATE TABLE, unique idx on `hubContractId`) |
| 1b | Zero DROP TABLE / DROP COLUMN on pre-existing tables (hub only) | PASS | n/a | n/a |
| 2 | `npx tsc --noEmit` passes (after `prisma generate`) | PASS (exit 0) | PASS (exit 0) | PASS (exit 0) |
| 3 | Git status clean, branch pushed | PASS* | PASS | PASS |
| 4 | `node --check scripts/smoke-dev.mjs` | n/a | PASS | PASS |
| 4 | `node --check scripts/monitor-clerk.mjs` | n/a | PASS | PASS |
| 5 | Exactly ONE live-hub-resolve-smoke script | n/a | PASS (`scripts/live-hub-resolve-smoke.mjs` only) | n/a |
| 6 | `.env.example` has `DATABASE_URL` + `HUB_AUTHORITY_MODE`, placeholders only | n/a | PASS | PASS |

\* Hub branch `suite-workflow-vnext-contract` has no upstream tracking configured locally, but
`origin/suite-workflow-vnext-contract` exists at the same commit (`e98e982`) — branch is fully pushed.

## Check Details

### 1. Migrations

- **hub**: `prisma/migrations/20260612031107_contract_registry_v1/migration.sql` — git-tracked
  (commit `307b2ee "chore(hub): contract registry migration files (not yet applied)"`).
  - Contains `CREATE TABLE "Contract"`, `CREATE TABLE "ContractMembership"`, `CREATE TABLE "ContractLifecycleEvent"`.
  - Contains `ALTER TYPE` statements (`ApiKeyScope` +contract_read/+contract_write, `AuditCategory` +contract).
  - Zero `DROP TABLE`; zero `DROP COLUMN`.
  - Non-blocking observations: 13 `DROP CONSTRAINT` statements (FK churn; all FKs are re-added with
    revised ON DELETE behaviors later in the same migration) and one `DROP INDEX "AgentRun_triggeredByApiKeyId_idx"`
    that is not recreated. These are outside the FAIL criteria but should be eyeballed at PR review.
- **bizops**: `prisma/migrations/20260612031118_init_bizops_domain/migration.sql` — git-tracked.
  3 CREATE TABLEs: `CompanyProfile`, `TeamMember`, `Campaign`.
- **contracts-delivery**: `prisma/migrations/20260612031121_init_contracts_domain/migration.sql` — git-tracked.
  3 CREATE TABLEs: `Contract`, `Clin`, `PeriodOfPerformance`. Unique index present:
  `CREATE UNIQUE INDEX "Contract_hubContractId_key" ON "Contract"("hubContractId")`.

No migrations were applied to any database.

### 2. Typecheck

`$env:DATABASE_URL="postgresql://x:x@localhost:5432/x"; npx prisma generate` then `npx tsc --noEmit`:

| Repo | prisma generate | tsc exit code |
|------|-----------------|---------------|
| hub | OK (client v5.22.0) | 0 |
| bizops | OK (client v5.22.0) | 0 |
| contracts-delivery | OK (client v5.22.0) | 0 |

### 3. Git hygiene

- `git status --porcelain` empty in all three repos (no untracked/unstaged files).
- bizops and contracts-delivery track their origin branches with no ahead/behind divergence.
- hub: local HEAD `e98e982` matches `refs/heads/suite-workflow-vnext-contract` on origin
  (verified via `git ls-remote`); no upstream tracking ref set locally (config nit only).
- No commits were pending push at audit start; nothing needed pushing for prior-wave work.

### 4. Script syntax checks (`node --check`, all exit 0)

- bizops: `scripts/smoke-dev.mjs`, `scripts/monitor-clerk.mjs`
- contracts-delivery: `scripts/smoke-dev.mjs`, `scripts/monitor-clerk.mjs`

### 5. bizops live-hub-resolve-smoke dedup

Exactly one script remains: `scripts/live-hub-resolve-smoke.mjs`. No `.ts` duplicate found.

### 6. `.env.example` audit

Both repos contain `DATABASE_URL` and `HUB_AUTHORITY_MODE` keys.
Values are placeholders only: `pk_test_...` / `sk_test_...` stubs, empty `MACTECH_HUB_SERVICE_TOKEN`,
local-docker dev DSNs (`postgres:dev@localhost`), `HUB_AUTHORITY_MODE="mock"`. No real credentials.

## Safety Confirmations

- No deployments, no database migrations run, no Railway/Vercel/Clerk/DNS activity.
- No files deleted, moved, or rewritten in any repo.
- Proposal repo untouched.
- Only artifact created: this report (committed on hub branch `suite-workflow-vnext-contract`).

## Verdict

WAVE GATE: PASS
