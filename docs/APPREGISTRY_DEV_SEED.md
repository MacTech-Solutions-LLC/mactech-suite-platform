# AppRegistry Dev Seed Runbook (Greenfield Keys)

**Phase 3f · dev-only · idempotent**

This runbook seeds the MacTech Suite **AppRegistry** with the three greenfield Commercial Suite apps introduced in [PR #119](https://github.com/MacTech-Solutions-LLC/mactech-suite-platform/pull/119):

| `appKey` | Display name | Subdomain | Repo |
|----------|--------------|-----------|------|
| `bizops` | BizOps | `bizops` | `MacTech-Solutions-LLC/bizops` |
| `contracts-delivery` | Contracts & Delivery | `contracts` | `MacTech-Solutions-LLC/contracts-delivery` |
| `client-portal` | Client Portal | `portal` | `MacTech-Solutions-LLC/client-portal` |

Fixture definitions live in `prisma/seed.ts` (`APP_FIXTURES` → `seedApps()`). The seed is **idempotent**: every row is upserted by stable `appKey`, so repeated runs do not create duplicates.

---

## ⚠️ DO NOT RUN ON PRODUCTION

| Rule | Why |
|------|-----|
| **Never** run `npm run db:seed` against production `DATABASE_URL` | Seed overwrites AppRegistry metadata, service identities, role templates, and dependency edges for the entire ecosystem — not just the three greenfield keys. |
| **Never** paste or commit `DATABASE_URL` values in tickets, PRs, or this doc | Connection strings are secrets. Use your local `.env` or a team secret manager. |
| **Production registry changes** go through reviewed migrations + controlled admin edits | Production AppRegistry is the source of truth for entitlements, health probes, and audit routing. |

**Allowed targets:** local Docker Postgres, personal dev/staging databases, and ephemeral preview databases where data loss or fixture overwrite is acceptable.

---

## Prerequisites

1. **Node.js 20+** and `npm install` completed in the platform repo root.
2. **Postgres reachable** from your machine (local Docker or team dev instance).
3. **`DATABASE_URL`** set in `.env` (or exported in your shell) pointing at the **dev** database — not production.
4. Optional bootstrap env vars (seed skips these when unset):
   - `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_CLERK_USER_ID`
   - `SEED_DEVELOPER_EMAIL` / `SEED_DEVELOPER_EXTERNAL_ID`
   - `AUDIT_INGEST_API_KEY`

---

## Commands

From the `mactech-suite-platform` repo root:

### 1. Validate schema (safe everywhere)

```bash
npx prisma validate
```

### 2. Apply pending migrations (dev database)

```bash
npm run db:deploy
```

Equivalent: `npx prisma migrate deploy`

### 3. Seed AppRegistry + ecosystem fixtures (dev only)

```bash
npm run db:seed
```

Equivalent: `npx prisma db seed` (configured in `package.json` → `tsx prisma/seed.ts`).

**What the seed writes (relevant to greenfield):**

- `AppRegistry` rows for `bizops`, `contracts-delivery`, `client-portal` (status `development`, lifecycle `development`)
- Matching `ServiceIdentity` rows (`{appKey} service identity`)
- `AppDependency` edges: each greenfield app → `identity-command-center` (`auth_provider`, `shared_component`)
- Full ecosystem fixtures (all other `APP_FIXTURES`, role templates, legacy tenant scaffold)

---

## Verification

### Option A — Read-only script (recommended)

Requires `DATABASE_URL` pointing at the database you just seeded:

```bash
npx tsx scripts/verify-appregistry-seed.ts
```

**Pass criteria:** exit code `0`, all three keys report `FOUND` with expected `status`, `lifecycle`, `subdomain`, and `repoFullName`.

### Option B — Prisma Studio (manual)

```bash
npm run db:studio
```

Open `AppRegistry` and filter `appKey` ∈ `{ bizops, contracts-delivery, client-portal }`.

### Option C — Command Center UI (when Suite dev server is running)

1. `npm run dev`
2. Sign in as a MacTech super admin.
3. Open `/admin/app-registry`.
4. Confirm all three apps appear with status **development**.

### Option D — SQL (read-only)

```sql
SELECT "appKey", name, status, lifecycle, subdomain, "repoFullName"
FROM "AppRegistry"
WHERE "appKey" IN ('bizops', 'contracts-delivery', 'client-portal')
ORDER BY "appKey";
```

Expect **3 rows**. Each should have `status = development`, `lifecycle = development`, and the `repoFullName` from the table above.

---

## Expected fixture snapshot

| Field | `bizops` | `contracts-delivery` | `client-portal` |
|-------|----------|----------------------|-----------------|
| `status` | `development` | `development` | `development` |
| `lifecycle` | `development` | `development` | `development` |
| `visibility` | `customer` | `customer` | `customer` |
| `requiresOrgContext` | `true` | `true` | `true` |
| `isInternalOnly` | `false` | `false` | `false` |
| `subdomain` | `bizops` | `contracts` | `portal` |
| `apexDomain` | `mactechsolutionsllc.com` | `mactechsolutionsllc.com` | `mactechsolutionsllc.com` |
| `criticality` | `medium` | `high` | `medium` |

`publicUrl` and `healthUrl` are intentionally **null** until each greenfield app ships a stable dev/prod URL and `/api/health` endpoint. Command Center will flag `missing_health_endpoint` until then — expected for scaffolds.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `PrismaClientInitializationError` / cannot reach database | Postgres not running or wrong `DATABASE_URL` | Start local DB (`npm run docker:up`) or fix `.env` |
| Verify script reports `MISSING` for a key | Seed not run, or wrong database | Re-run `npm run db:seed` against the intended dev DB |
| `skip dependency … missing app` warnings during seed | Upstream `APP_FIXTURES` row missing | Ensure `main` includes PR #119 seed fixtures; do not rename `appKey` values |
| Apps visible in DB but not in UI | Clerk session / role | Bootstrap super admin via `SEED_SUPER_ADMIN_EMAIL` or use an existing MacTech super admin account |

---

## Related docs

- [COMMAND_CENTER.md](./COMMAND_CENTER.md) — AppRegistry model, health URL conventions
- [HUB_CLIENT_CONSUMER_GUIDE.md](./HUB_CLIENT_CONSUMER_GUIDE.md) — how satellites resolve hub authority
- `packages/hub-client/src/types/app-key.ts` — typed `MacTechAppKey` union including greenfield keys

---

## Run log

Record dev seed executions in the control repo:

`mactech-suite-workspace-control/local-work-recovery/phase-3f-appregistry-dev-seed.md`
