# Live Hub Authority Pilot — BizOps Only

**Phase 3g · `appKey: bizops` · Brian-executable**

Scoped runbook for the **first** live Hub authority cutover. Contracts and Client Portal remain on `HUB_AUTHORITY_MODE=mock` until BizOps pilot sign-off.

**Binding:** DR-2026-06-10-01 · DR-2026-06-10-02

**Related:**

- General cutover checklist: `docs/LIVE_HUB_CUTOVER_CHECKLIST.md`
- Wiring and env var names: `docs/LIVE_HUB_AUTHORITY_WIRING.md`
- BizOps smoke URLs (custom domain): `MacTech-Solutions-LLC/bizops` → `docs/LIVE_HUB_PILOT.md`

**Safety:** No tokens, `.env` values, or Railway secret contents in git, PRs, or agent transcripts. Agents must **not** set `HUB_AUTHORITY_MODE=live` or write `MACTECH_HUB_SERVICE_TOKEN`.

---

## Pilot scope

| Field | Value |
| --- | --- |
| Satellite `appKey` | `bizops` |
| Railway project | BizOps (`MacTech-Solutions-LLC/bizops`) |
| Custom domain (verified 3g-01) | `https://bizops.mactechsolutionsllc.com` |
| Railway default URL | `https://bizops-production-4d93.up.railway.app` |
| Hub production origin | Suite / identity-command-center deployment (`MACTECH_HUB_URL`) |
| Current mode | `mock` (pre-tenant default) |

**3g-01 custom-domain smoke (2026-06-11):** Health, hub-mock, sign-in, and TLS all **PASS** on `bizops.mactechsolutionsllc.com`. CNAME still points at a legacy Railway target; traffic resolves correctly today. DNS alignment is recommended before long-term cert stability (see bizops repo `docs/CLERK_CUSTOM_DOMAIN.md`).

---

## Pre-flight (Hub admin — Brian)

Complete **before** any Railway secret or mode flip. Full detail in `docs/LIVE_HUB_CUTOVER_CHECKLIST.md` Phase 1.

### AppRegistry

- [ ] Confirm Hub `AppRegistry` row for `appKey` **`bizops`** exists.
- [ ] Set `status` to **`active`** (not `development` / `inactive`).
- [ ] Confirm `isInternalOnly` is **`false`** (customer-facing satellite).
- [ ] Confirm Railway `MACTECH_APP_KEY` is exactly **`bizops`** (see `canonical-app-keys.md` in control repo).

### ServiceIdentity

- [ ] Confirm backing `ServiceIdentity` for `bizops` exists and `status` is **`active`**.

### Pilot tenant (first org)

- [ ] **First pilot tenant** exists in Hub — `CustomerOrganization`, Clerk org binding, and at least one `OrgUserAccess` membership synced.
- [ ] Create or confirm `ProductEntitlement` for the pilot org + `appKey` **`bizops`**.
- [ ] Entitlement `status` is **`active`**; `startsAt` / `expiresAt` cover the pilot window.

### Hub ApiKey

- [ ] Create Hub `ApiKey` for the BizOps service identity:
  - **Scopes:** `app_authority_resolve` (required); `audit_ingest` if BizOps emits audit events.
  - **App tag:** `bizops` (matches `MACTECH_APP_KEY`).
  - **Status:** `active`; set `expiresAt` per rotation policy.
- [ ] **Script (preferred):** `docs/HUB_SERVICE_TOKEN_ISSUANCE.md` — `railway run npx tsx scripts/issue-app-hub-token.ts bizops --dry-run` then issue without `--dry-run`.
- [ ] **Manual fallback:** Hub admin → `/admin/api-keys` → Issue API key (same scopes + `bizops` app tag).
- [ ] Copy plaintext token **once** into deployment secret store as `MACTECH_HUB_SERVICE_TOKEN` (never commit or paste in PR/chat).

### Satellite wiring (code — already on main)

- [ ] BizOps uses `createHubAuthorityClient` → `resolveAppAccess` on protected routes (`requireAppAuthContext` in `lib/auth/context.ts`).
- [ ] Clerk middleware validates session before Hub call; no Clerk-only RBAC bypass.

### Infrastructure

- [ ] Hub production reachable at target `MACTECH_HUB_URL`.
- [ ] **Staging slot** available on BizOps Railway project for token smoke test before production flip.

---

## Railway variable rollout (names only)

Apply on **BizOps Railway project only**. Order matters: URL and token **before** mode flip.

| Step | Variable | Action |
| --- | --- | --- |
| 1 | `MACTECH_HUB_URL` | Set Hub production origin (non-secret). Keep `HUB_AUTHORITY_MODE=mock`. |
| 2 | `MACTECH_APP_KEY` | Confirm value is `bizops` (non-secret). |
| 3 | `MACTECH_HUB_SERVICE_TOKEN` | Add via Railway **secret UI** (staging first, then production). |
| 4 | `HUB_AUTHORITY_MODE` | Keep **`mock`** until staging smoke passes. |
| 5 | `HUB_AUTHORITY_MODE` | Set to **`live`** on production **only** after staging smoke and Brian sign-off. |

**Do not** flip `HUB_AUTHORITY_MODE=live` until steps 1–3 are complete and staging smoke passes.

### Staging smoke (still `mock` on production)

On BizOps **staging** deployment only:

1. Set `MACTECH_HUB_URL`, `MACTECH_APP_KEY`, and `MACTECH_HUB_SERVICE_TOKEN` (secret).
2. Temporarily set `HUB_AUTHORITY_MODE=live` on **staging**.
3. Redeploy; confirm process starts (no `createHubAuthorityClient: live mode requires live.serviceToken`).
4. Run verification commands below against staging base URL.
5. Revert staging to `mock` if production cutover is not yet scheduled.

### Production mode flip

1. Set `HUB_AUTHORITY_MODE=live` on BizOps **production** service.
2. Redeploy.
3. Monitor startup logs for Hub client factory errors.
4. Run production verification below.

---

## Verification (post-cutover)

### 3.1 Health — `hubMode: live`

Anonymous; no auth required.

```bash
curl -sS https://bizops.mactechsolutionsllc.com/api/health
```

Expected `200`:

```json
{ "status": "ok", "appKey": "bizops", "hubMode": "live" }
```

Railway fallback (if custom domain unavailable):

```bash
curl -sS https://bizops-production-4d93.up.railway.app/api/health
```

**Fail:** `hubMode` still `mock` → mode flip not applied or wrong service redeployed.

### 3.2 `resolveAppAccess` smoke — protected route

`/api/smoke/hub-mock` is **mock-only** (returns `skipped` when `hubMode` is `live`). Use authenticated protected surfaces instead.

**Allow path (pilot user):**

1. Sign in at `https://bizops.mactechsolutionsllc.com/sign-in` as a user in the **pilot org** with active Hub entitlement.
2. Open `https://bizops.mactechsolutionsllc.com/` (home).
3. Expect HTTP **200** and page copy showing Hub-authorized org id (from `ctx.hub.tenant.organizationId`).
4. Confirm `snapshot.user.id` and `snapshot.tenant.organizationId` are non-empty Hub canonical IDs (inspect server logs or temporary debug if needed).

**Deny path (non-entitled user or wrong org):**

1. Sign in as a Clerk user **without** BizOps entitlement (or switch to a non-pilot org).
2. Open `https://bizops.mactechsolutionsllc.com/`.
3. Expect redirect to `/access-denied` (Hub denied; not silent mock allow).

**Deny path (unauthenticated):**

```bash
curl -sS -o /dev/null -w "HTTP:%{http_code}\n" https://bizops.mactechsolutionsllc.com/
```

Expect redirect to sign-in (302/307) or 401 — not 200 with protected content.

### 3.3 Hub-side signals

- [ ] Hub authority resolve endpoint logs show `sourceAppKey` **`bizops`**.
- [ ] No unexpected **401** (invalid ApiKey) or **500** from Hub.

### 3.4 Regression guard

- [ ] `npm run build` in `packages/hub-client` passes on the platform branch BizOps pins.
- [ ] `npm run build` in BizOps repo passes after cutover.

---

## Rollback

If live cutover fails or causes incorrect access:

1. **Immediate:** Set `HUB_AUTHORITY_MODE=mock` on BizOps Railway **production** service and redeploy.
2. **Confirm health:**

   ```bash
   curl -sS https://bizops.mactechsolutionsllc.com/api/health
   ```

   Expect `"hubMode": "mock"`.

3. **Confirm mock smoke restored:**

   ```bash
   curl -sS https://bizops.mactechsolutionsllc.com/api/smoke/hub-mock
   ```

   Expect `200` with `"hubMode": "mock"`, `"allowed": true`.

4. **Protected routes:** Pilot users may see mock fixture allow/deny (not production Hub truth) until live is re-enabled.
5. **Hub-side (if needed):** Revoke or rotate the BizOps Hub `ApiKey`; update `MACTECH_HUB_SERVICE_TOKEN` before retry.
6. **Root-cause:** Inspect `snapshot.reason`, Hub `AppRegistry` / entitlement rows, and ApiKey scopes before second attempt.
7. **Document:** Note failure mode in cutover ticket; do not leave production on `live` with a missing or invalid token.

**Do not** roll back by bypassing `resolveAppAccess` or reintroducing Clerk-only authorization.

---

## Pilot sign-off

| Field | Value |
| --- | --- |
| Satellite `appKey` | `bizops` |
| Railway project / environment | BizOps production |
| Pilot org (Clerk + Hub) | |
| Cutover date (UTC) | |
| Verified by | |
| Rollback tested (Y/N) | |

After sign-off, update `docs/LIVE_HUB_AUTHORITY_WIRING.md` pilot table and plan contracts / portal cutovers separately.

---

## What agents must not do

- Flip Railway `HUB_AUTHORITY_MODE` to `live` via automation
- Create or revoke production Hub ApiKeys
- Commit or echo secret values
- Enable live mode on contracts or portal in the same change set
- Skip staging smoke test before production flip
