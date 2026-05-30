# Validation Blockers

Date: 2026-05-30

GitHub tracking issue: https://github.com/MacTech-Solutions-LLC/mactech-suite-platform/issues/102

## Database-backed Prisma migration generation

Command:

```bash
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/mactech_suite_placeholder'; npx prisma migrate dev --name hub-authority-contract-v1 --create-only
```

Result: failed.

Summary: Prisma loaded the schema but could not reach a PostgreSQL database at `localhost:5432`; the command ended with a schema engine error. The migration SQL was created manually at `prisma/migrations/20260530000000_hub_authority_contract_v1/migration.sql`, but it has not been verified against a live development database.

Missing service/access: reachable non-production PostgreSQL `DATABASE_URL`.

## Seed/backfill dry run

Command:

```bash
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/mactech_suite_placeholder'; npx tsx prisma/seed.ts
```

Result: failed.

Summary: `PrismaClientInitializationError`: cannot reach database server at `localhost:5432` during `prisma.appRegistry.upsert()` in `seedApps()`.

Missing service/access: reachable non-production PostgreSQL `DATABASE_URL`.

## Railway diagnostics

Command:

```bash
railway status
```

Result: failed.

Summary: Railway CLI reported `No linked project found. Run railway link to connect to a project`.

Missing service/access: linked Railway project/environment for this checkout. No Railway production deployment was attempted.

## Notes

Schema-only validation succeeded with a placeholder `DATABASE_URL`:

```bash
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/mactech_suite_placeholder'; npx prisma validate
```

The following non-database validations passed locally:

```bash
npm install
npm run test
npm run typecheck
npm run lint
npm run build:hub-client
npm run build
node --import tsx -e "import { createHubServiceClient, verifyAuthoritySnapshot } from './packages/hub-client/src/index.ts'; console.log(typeof createHubServiceClient, typeof verifyAuthoritySnapshot)"
```
