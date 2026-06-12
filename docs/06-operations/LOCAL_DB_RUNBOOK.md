# Local DB Runbook — Hub / BizOps / Contracts-Delivery

**Scope:** Local development databases for the three Prisma apps:

| App | Repo | Schema path | Local DB name |
|-----|------|-------------|---------------|
| Hub | `mactech-suite-platform` | `prisma/schema.prisma` | `hub_dev` |
| BizOps | `bizops` | `prisma/schema.prisma` | `bizops_dev` |
| Contracts | `contracts-delivery` | `prisma/schema.prisma` | `contracts_dev` |

This runbook covers **local development only**. It never touches Railway or production.

---

## 1. One-time setup — local Postgres via Docker

```powershell
docker run -d --name suite-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
```

Wait for readiness (`docker logs suite-pg` until `ready to accept connections`), then create one database per app:

```powershell
docker exec suite-pg psql -U postgres -c "CREATE DATABASE hub_dev;"
docker exec suite-pg psql -U postgres -c "CREATE DATABASE bizops_dev;"
docker exec suite-pg psql -U postgres -c "CREATE DATABASE contracts_dev;"
```

Connection string format:

```
postgresql://postgres:dev@localhost:5432/<db_name>
```

---

## 2. Per-app workflow

Set `DATABASE_URL` in each repo's `.env.local` (**never committed** — `.env.local` is gitignored):

```
DATABASE_URL="postgresql://postgres:dev@localhost:5432/hub_dev"        # hub
DATABASE_URL="postgresql://postgres:dev@localhost:5432/bizops_dev"     # bizops
DATABASE_URL="postgresql://postgres:dev@localhost:5432/contracts_dev"  # contracts-delivery
```

Then per repo:

| Action | Hub (`mactech-suite-platform`) | bizops / contracts-delivery |
|--------|-------------------------------|------------------------------|
| Apply migrations + create new | `npm run db:migrate` (= `prisma migrate dev`) | `npx prisma migrate dev` |
| Regenerate client | `npm run db:generate` | `npx prisma generate` |
| Inspect data | `npm run db:studio` | `npx prisma studio` |
| Seed (Hub only) | `npm run db:seed` | n/a |

Hub's `start` script runs `prisma migrate deploy && next start` — bizops and contracts-delivery do not yet have `db:*` script aliases; use `npx prisma ...` directly.

---

## 3. Generate without a database (fake-URL trick)

`prisma generate` never connects to the database — it only reads `schema.prisma`. When you just need fresh client types (e.g. CI, or before the local container is up):

```powershell
$env:DATABASE_URL = "postgresql://x:x@localhost:5432/x"
npx prisma generate
```

Use this when: building the app without DB access, fixing TS types after a schema pull, or in pipelines that don't run migrations.

---

## 4. Reset procedure — LOCAL ONLY

> **⚠️ WARNING: `prisma migrate reset` DROPS THE ENTIRE DATABASE and replays all migrations. Run it ONLY against `localhost`. Never run it with a Railway `DATABASE_URL` in scope — check `echo $env:DATABASE_URL` first.**

```powershell
npx prisma migrate reset
```

Use when local migration state is wedged or you want a clean slate. Hub seed data can be restored afterwards with `npm run db:seed`.

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| IDE shows stale Prisma client types (model/field missing) | Generated client out of date | Re-run `npx prisma generate`, then restart the TS server (VS Code/Cursor: `TypeScript: Restart TS Server`) |
| `P1001: Can't reach database server at localhost:5432` | Postgres container not running | `docker start suite-pg` (or re-run the `docker run` from §1) |
| `P1001 ... postgres.railway.internal:5432` | `DATABASE_URL` resolved to Railway in-cluster host from local machine | You are pointing at a Railway runtime URL; switch to the local URL (or, for read-only checks against Railway, the Postgres service `DATABASE_PUBLIC_URL` — never for `migrate dev`/`reset`) |
| Migration drift detected (`migrate dev` wants to reset) | Local DB diverged from `prisma/migrations/` history | Reset the **local** DB (`npx prisma migrate reset`). **Never** run `migrate resolve` or drift fixes against production |
| `database "<name>" already exists` on CREATE DATABASE | Already created previously | Safe to ignore |

---

## 6. Hard rules

- Production migrations are run only by Brian, per phase gate.
- Never point `migrate dev`/`reset` at a Railway `DATABASE_URL`.
- Migration files are committed via the migration-hygiene lane before any apply.

---

## References

- `docs/05-architecture/SUITE_WORKFLOW_CONTRACT.md` — Hub Contract Registry thin-authority model
- `docs/05-architecture/SUITE_APP_AUTHORITY_MAP.md` — app authority boundaries
