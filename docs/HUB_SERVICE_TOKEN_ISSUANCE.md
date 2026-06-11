# Hub service token issuance

**Ops runbook · Brian-operable · no secrets in git**

Repeatable procedure to issue a scoped Hub `ApiKey` for a satellite `appKey` during live authority pilot cutover. Mirrors manual issuance at `/admin/api-keys` with the default live-pilot scopes.

**Binding:** DR-2026-06-10-01 — Hub owns authorization; this script is ops tooling only.

---

## When to use

- First live Hub authority cutover for a satellite (`HUB_AUTHORITY_MODE=live`)
- Rotating `MACTECH_HUB_SERVICE_TOKEN` after compromise or scheduled rotation
- Staging smoke before production mode flip (separate key per environment recommended)

**Do not use** for T3 repos or apps without an active `AppRegistry` + `ServiceIdentity` row.

---

## Prerequisites

Complete before running the script:

| Check | Where |
| --- | --- |
| `AppRegistry` row exists for `appKey` | Hub admin → Apps, or `prisma/seed.ts` fixtures |
| `AppRegistry.status` is **`active`** | Not `development` / `inactive` for live pilot |
| `ServiceIdentity` row exists for same `appKey` | Seeded with `npm run db:seed` or Hub admin |
| `ServiceIdentity.status` is **`active`** | Required by `resolveAppAccess` |
| Pilot org + `ProductEntitlement` (live pilot) | See `docs/LIVE_HUB_CUTOVER_CHECKLIST.md` Phase 1 |
| `DATABASE_URL` points at target Hub database | Railway CLI or local `.env` — **never commit** |

---

## Default scopes

| Scope | Purpose |
| --- | --- |
| `app_authority_resolve` | **Required** — `POST /api/hub/authority/resolve-app-access` |
| `audit_ingest` | Optional default — BizOps audit event emission |

Override with `--scopes` (comma-separated). Minimum for live authority is `app_authority_resolve`.

---

## Command examples

**Dry-run** (validates prerequisites, no database write):

```bash
railway run npx tsx scripts/issue-app-hub-token.ts bizops --dry-run
```

**Issue token** (prints plaintext once to stdout):

```bash
railway run npx tsx scripts/issue-app-hub-token.ts bizops
```

**Custom scopes:**

```bash
railway run npx tsx scripts/issue-app-hub-token.ts bizops --scopes app_authority_resolve
```

**Help:**

```bash
npx tsx scripts/issue-app-hub-token.ts --help
```

Replace `bizops` with the target satellite `appKey` (`contracts-delivery`, `client-portal`, etc.).

---

## Railway variable

| Variable | Where to set | Notes |
| --- | --- | --- |
| `MACTECH_HUB_SERVICE_TOKEN` | Satellite Railway project **secret UI** | Staging first, then production |
| `MACTECH_HUB_URL` | Satellite env (non-secret) | Hub production origin |
| `MACTECH_APP_KEY` | Satellite env (non-secret) | Must match issued key `appKey` tag |
| `HUB_AUTHORITY_MODE` | Satellite env | Keep `mock` until token smoke passes |

**Order:** Set `MACTECH_HUB_URL` and `MACTECH_HUB_SERVICE_TOKEN` before flipping `HUB_AUTHORITY_MODE=live`. See `docs/LIVE_HUB_PILOT_BIZOPS.md` for BizOps rollout.

---

## After issuance

1. Copy the `token` field from script stdout **once**.
2. Paste into Railway as `MACTECH_HUB_SERVICE_TOKEN` (staging, then production).
3. Redeploy satellite; confirm startup (no `live mode requires live.serviceToken` error).
4. Run staging smoke with `HUB_AUTHORITY_MODE=live` before production flip.
5. **Never** commit the token, paste in PRs, or echo in agent transcripts.

Script output goes to **stdout only** — not written to files in the repo.

---

## Revocation and rotation

| Action | How |
| --- | --- |
| **Revoke** | Hub admin → **API Keys** (`/admin/api-keys`) → revoke the old key |
| **Rotate** | Issue a new key (this script or admin UI), update Railway secret, redeploy, then revoke old key |
| **Emergency** | Set `HUB_AUTHORITY_MODE=mock` on satellite and redeploy; revoke compromised key |

After rotation, update `MACTECH_HUB_SERVICE_TOKEN` on every satellite environment that used the old key before revoking, or live calls will return **401**.

See also:

- `docs/LIVE_HUB_PILOT_BIZOPS.md` — BizOps rollback (revoke + re-issue)
- `docs/LIVE_HUB_CUTOVER_CHECKLIST.md` — general cutover checklist
- `docs/HUB_CLIENT_CONSUMER_GUIDE.md` — scope selection for non-pilot consumers

---

## What agents must not do

- Run this script against production Hub without Brian authorization
- Auto-set Railway variables
- Commit example tokens, `.env`, or live pilot secrets
- Issue tokens for T3 repos
