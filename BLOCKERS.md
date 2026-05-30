# Validation Blockers And Resolution

Date: 2026-05-30

GitHub tracking issue: https://github.com/MacTech-Solutions-LLC/mactech-suite-platform/issues/102

Status: resolved during the approved Railway deployment flow.

## Database-backed Prisma migration generation

Command:

```bash
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/mactech_suite_placeholder'; npx prisma migrate dev --name hub-authority-contract-v1 --create-only
```

Initial result: failed.

Summary: Prisma loaded the schema but could not reach a PostgreSQL database at `localhost:5432`; the command ended with a schema engine error. The migration SQL was created manually at `prisma/migrations/20260530000000_hub_authority_contract_v1/migration.sql`, but it has not been verified against a live development database.

Resolution: Railway project `MacTech_Suite`, service `mactech-suite-platform`, environment `production` was linked after deployment approval. `railway run npx prisma migrate deploy` applied `20260530000000_hub_authority_contract_v1` successfully.

## Seed/backfill dry run

Command:

```bash
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/mactech_suite_placeholder'; npx tsx prisma/seed.ts
```

Initial result: failed.

Summary: `PrismaClientInitializationError`: cannot reach database server at `localhost:5432` during `prisma.appRegistry.upsert()` in `seedApps()`.

Resolution: `railway run npm run db:seed` completed successfully after the project was linked.

## Railway diagnostics

Command:

```bash
railway status
```

Initial result: failed.

Summary: Railway CLI reported `No linked project found. Run railway link to connect to a project`.

Resolution: `railway link --project f89efd3b-289a-49cc-93f8-b9af2a7846d6 --service 1bd0fda3-22d4-4f54-8644-1b66aba6f4a1 --environment production` linked the checkout. Production deployment was later explicitly approved and completed.

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

Additional post-link validation:

```bash
railway run npx prisma migrate deploy
railway up --environment production --service mactech-suite-platform --message "Deploy Hub Authority Contract v1 (797f95c)" --ci
railway run npm run db:seed
railway service status --service mactech-suite-platform
```

## Local GitHub Packages authentication after rebase

Command:

```bash
npm install
```

Result: failed.

Summary: npm could not authenticate to GitHub Packages for the private dependency `@mactech-solutions-llc/onboard@0.2.0`.

Error summary:

```text
npm error code E401
npm error 401 Unauthorized - GET https://npm.pkg.github.com/download/@mactech-solutions-llc/onboard/0.2.0/... - unauthenticated: User cannot be authenticated with the token provided.
```

Missing variable/permission/service: a valid local npm/GitHub Packages token with access to `@mactech-solutions-llc/onboard` and `@mactech-solutions-llc/design-tokens` (`read:packages` scope or equivalent organization package permission). Railway production has package access configured and completed the prior production build successfully.

Blocked validation commands:

```bash
npm run typecheck
npm run build
```

Current error summary: because `npm install` could not restore private and public dependencies into `node_modules`, TypeScript/Next cannot resolve `@mactech-solutions-llc/onboard`, `@mactech-solutions-llc/design-tokens`, `recharts`, `geist`, `motion`, and `cron-parser`. The Hub Authority targeted checks still pass:

```bash
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/mactech_suite_placeholder'; npx prisma validate
npm run test
npm run build:hub-client
npm run lint
```

Reconfirmed during Hub Audit Ingestion v1 on 2026-05-30:

```bash
npm install
```

failed with the same GitHub Packages `E401` for `@mactech-solutions-llc/onboard@0.2.0`. This continues to block full local `npm run typecheck` and `npm run build`; the audit-specific TypeScript errors found during implementation were fixed, and the remaining typecheck output is the missing dependency set listed above.

## Hub Audit Ingestion v1 migration creation check

GitHub tracking issue: https://github.com/MacTech-Solutions-LLC/mactech-suite-platform/issues/106

Command:

```bash
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/mactech_suite_placeholder'; npx prisma migrate dev --name hub-audit-ingestion-v1 --create-only
```

Result: failed.

Summary: Prisma loaded the schema but could not reach a PostgreSQL database at `localhost:5432`; the command ended with a schema engine error. The migration SQL was created manually at `prisma/migrations/20260530120000_hub_audit_ingestion_v1/migration.sql` and includes the legacy `AuditLog` backfill plus PostgreSQL append-only trigger enforcement.

Missing variable/permission/service: a reachable non-production PostgreSQL `DATABASE_URL` for Prisma migration dry-run checks.

## SuiteObjectReference migration creation check

GitHub tracking issue: https://github.com/MacTech-Solutions-LLC/mactech-suite-platform/issues/106
Downstream repo confirmation issue: https://github.com/MacTech-Solutions-LLC/mactech-suite-platform/issues/108

Command:

```bash
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/mactech_suite_placeholder'; npx prisma migrate dev --name suite-object-reference-contract --create-only
```

Result: failed.

Summary: Prisma loaded the schema but could not reach a PostgreSQL database at `localhost:5432`; the command ended with `Schema engine error`. The SuiteObjectReference SQL was added to the existing unmerged Hub audit migration because that migration already introduced the stub reference table used by `AuditLog.suiteObjectReferenceId`.

Missing variable/permission/service: a reachable non-production PostgreSQL `DATABASE_URL` for Prisma migration dry-run checks.

## SuiteObjectReference local typecheck

Command:

```bash
npm run typecheck
```

Result: failed.

Summary: SuiteObjectReference and hub-client TypeScript errors were fixed after `npx prisma generate`. The remaining failures are the existing dependency-resolution blocker from `npm install`/GitHub Packages authentication: TypeScript cannot resolve `@mactech-solutions-llc/onboard`, `@mactech-solutions-llc/design-tokens`, `recharts`, `geist`, `motion`, and `cron-parser`, followed by implicit-any noise in files that depend on those missing packages.

Missing variable/permission/service: a valid local npm/GitHub Packages token with read access to private MacTech packages and a restored local dependency tree.
