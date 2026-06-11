# Live Hub Authority Pilot — Contracts & Delivery

**Phase 3i · `appKey: contracts-delivery` · Brian-executable**

Scoped runbook for the **second** live Hub authority cutover. Execute **only after** BizOps pilot sign-off (`docs/LIVE_HUB_PILOT_BIZOPS.md`). Client Portal remains on `HUB_AUTHORITY_MODE=mock` until Contracts pilot sign-off.

**Binding:** DR-2026-06-10-01 · DR-2026-06-10-02

**Related:**

- General cutover checklist: `docs/LIVE_HUB_CUTOVER_CHECKLIST.md`
- Wiring and env var names: `docs/LIVE_HUB_AUTHORITY_WIRING.md`
- Hub CORS + custom-domain prep: `docs/HUB_SATELLITE_CORS_CUTOVER.md` (step 2 — contracts-delivery)
- Contracts smoke URLs (custom domain): `MacTech-Solutions-LLC/contracts-delivery` → `docs/LIVE_HUB_PILOT.md`
- BizOps pilot (prerequisite): `docs/LIVE_HUB_PILOT_BIZOPS.md`

**Safety:** No tokens, `.env` values, or Railway secret contents in git, PRs, or agent transcripts. Agents must **not** set `HUB_AUTHORITY_MODE=live` or write `MACTECH_HUB_SERVICE_TOKEN`.

---

## Pilot scope

| Field | Value |
| --- | --- |
| Satellite `appKey` | `contracts-delivery` |
| Railway project | Contracts & Delivery (`MacTech-Solutions-LLC/contracts-delivery`) |
| Custom domain (3g-01 partial) | `https://contracts.mactechsolutionsllc.com` |
| Railway default URL | `https://contracts-delivery-production.up.railway.app` |
| Hub production origin | Suite / identity-command-center deployment (`MACTECH_HUB_URL`) |
| Current mode | `mock` (pre-tenant default) |
| Prerequisite | BizOps live pilot sign-off complete |

**3g-01 custom-domain smoke (2026-06-11):** Health, sign-in, and TLS **PASS** on `contracts.mactechsolutionsllc.com`. Hub-mock on custom domain was **PARTIAL** (timeout — resolve app-side before cutover). Railway default URL hub-mock passes (Phase 3h). See `docs/HUB_SATELLITE_CORS_CUTOVER.md` step 2 gate.

---

## Pre-flight (Hub admin — Brian)

Complete **before** any Railway secret or mode flip. Full detail in `docs/LIVE_HUB_CUTOVER_CHECKLIST.md` Phase 1.

### BizOps prerequisite

- [ ] BizOps live pilot signed off per `docs/LIVE_HUB_PILOT_BIZOPS.md`.
- [ ] Hub CORS / allowed-origin config includes `https://contracts.mactechsolutionsllc.com` (+ Railway default URL during dual-host window) per `docs/HUB_SATELLITE_CORS_CUTOVER.md` step 2.

### AppRegistry

- [ ] Confirm Hub `AppRegistry` row for `appKey` **`contracts-delivery`** exists.
- [ ] Set `status` to **`active`** (not `development` / `inactive`).
- [ ] Confirm `isInternalOnly` is **`false`** (customer-facing satellite).
- [ ] Confirm Railway `MACTECH_APP_KEY` is exactly **`contracts-delivery`** (see `canonical-app-keys.md` in control repo).
- [ ] Update `baseUrl` / `publicUrl` to `https://contracts.mactechsolutionsllc.com` after DNS stable.

### ServiceIdentity

- [ ] Confirm backing `ServiceIdentity` for `contracts-delivery` exists and `status` is **`active`**.

### Pilot tenant

- [ ] Pilot tenant exists in Hub — `CustomerOrganization`, Clerk org binding, and at least one `OrgUserAccess` membership synced.
- [ ] Create or confirm `ProductEntitlement` for the pilot org + `appKey` **`contracts-delivery`**.
- [ ] Entitlement `status` is **`active`**; `startsAt` / `expiresAt` cover the pilot window.

### Hub ApiKey

- [ ] Create Hub `ApiKey` for the Contracts service identity:
  - **Scopes:** `app_authority_resolve` (required); `audit_ingest` if Contracts emits audit events.
  - **App tag:** `contracts-delivery` (matches `MACTECH_APP_KEY`).
  - **Status:** `active`; set `expiresAt` per rotation policy.
- [ ] **Script (preferred):** `docs/HUB_SERVICE_TOKEN_ISSUANCE.md` — `railway run npx tsx scripts/issue-app-hub-token.ts contracts-delivery --dry-run` then issue without `--dry-run`.
- [ ] **Manual fallback:** Hub admin → `/admin/api-keys` → Issue API key (same scopes + `contracts-delivery` app tag).
- [ ] Copy plaintext token **once** into deployment secret store as `MACTECH_HUB_SERVICE_TOKEN` (never commit or paste in PR/chat).

### Satellite wiring (code — already on main)

- [ ] Contracts uses `createHubAuthorityClient` → `resolveAppAccess` on protected routes (`requireAppAuthContext` in `lib/auth/context.ts`).
- [ ] Protected surfaces: `/`, `/contracts`, `/contracts/[id]`.
- [ ] Clerk middleware validates session before Hub call; no Clerk-only RBAC bypass.

### Infrastructure

- [ ] Hub production reachable at target `MACTECH_HUB_URL`.
- [ ] **Staging slot** available on Contracts Railway project for token smoke test before production flip.
- [ ] Custom-domain hub-mock timeout resolved (3g-01 B3 gate) before production live flip.

---

## Railway variable rollout (names only)

Apply on **Contracts & Delivery Railway project only**. Order matters: URL and token **before** mode flip.

| Step | Variable | Action |
| --- | --- | --- |
| 1 | `MACTECH_HUB_URL` | Set Hub production origin (non-secret). Keep `HUB_AUTHORITY_MODE=mock`. |
| 2 | `MACTECH_APP_KEY` | Confirm value is `contracts-delivery` (non-secret). |
| 3 | `MACTECH_HUB_SERVICE_TOKEN` | Add via Railway **secret UI** (staging first, then production). |
| 4 | `HUB_AUTHORITY_MODE` | Keep **`mock`** until staging smoke passes. |
| 5 | `HUB_AUTHORITY_MODE` | Set to **`live`** on production **only** after staging smoke and Brian sign-off. |

**Do not** flip `HUB_AUTHORITY_MODE=live` until steps 1–3 are complete and staging smoke passes.

### Staging smoke (still `mock` on production)

On Contracts **staging** deployment only:

1. Set `MACTECH_HUB_URL`, `MACTECH_APP_KEY`, and `MACTECH_HUB_SERVICE_TOKEN` (secret).
2. Temporarily set `HUB_AUTHORITY_MODE=live` on **staging**.
3. Redeploy; confirm process starts (no `createHubAuthorityClient: live mode requires live.serviceToken`).
4. Run verification commands below against staging base URL.
5. Revert staging to `mock` if production cutover is not yet scheduled.

### Production mode flip

1. Set `HUB_AUTHORITY_MODE=live` on Contracts **production** service.
2. Redeploy.
3. Monitor startup logs for Hub client factory errors.
4. Run production verification below.

---

## Verification (post-cutover)

### 3.1 Health — `hubMode: live`

Anonymous; no auth required.

```bash
curl -sS https://contracts.mactechsolutionsllc.com/api/health
```

Expected `200`:

```json
{ "status": "ok", "appKey": "contracts-delivery", "hubMode": "live" }
```

Railway fallback (if custom domain unavailable):

```bash
curl -sS https://contracts-delivery-production.up.railway.app/api/health
```

**Fail:** `hubMode` still `mock` → mode flip not applied or wrong service redeployed.

### 3.2 `resolveAppAccess` smoke — protected route

**Entitlement setup (Brian, pre-cutover):** Create `ProductEntitlement` for pilot org + `appKey: contracts-delivery` per `docs/LIVE_HUB_CUTOVER_CHECKLIST.md` Phase 1.3.

`/api/smoke/hub-mock` is **mock-only** (returns `skipped` when `hubMode` is `live`). Use authenticated protected surfaces instead.

**Allow path (pilot user):**

1. Sign in at `https://contracts.mactechsolutionsllc.com/sign-in` as a user in the **pilot org** with active Hub entitlement.
2. Open `https://contracts.mactechsolutionsllc.com/` (home).
3. Expect HTTP **200** and page copy showing Hub-authorized org id (from `ctx.hub.tenant.organizationId`).
4. Open `https://contracts.mactechsolutionsllc.com/contracts` — expect **200** with Hub-authorized context.
5. Confirm `snapshot.user.id` and `snapshot.tenant.organizationId` are non-empty Hub canonical IDs (inspect server logs or temporary debug if needed).

**Deny path (non-entitled user or wrong org):**

1. Sign in as a Clerk user **without** Contracts entitlement (or switch to a non-pilot org).
2. Open `https://contracts.mactechsolutionsllc.com/`.
3. Expect redirect to `/access-denied` (Hub denied; not silent mock allow).

**Deny path (unauthenticated):**

```bash
curl -sS -o /dev/null -w "HTTP:%{http_code}\n" https://contracts.mactechsolutionsllc.com/
```

Expect redirect to sign-in (302/307) or 401 — not 200 with protected content.

### 3.3 Hub-side signals

- [ ] Hub authority resolve endpoint logs show `sourceAppKey` **`contracts-delivery`**.
- [ ] No unexpected **401** (invalid ApiKey) or **500** from Hub.

### 3.4 Regression guard

- [ ] `npm run build` in `packages/hub-client` passes on the platform branch Contracts pins.
- [ ] `npm run build` in Contracts repo passes after cutover.

---

## Rollback

If live cutover fails or causes incorrect access:

1. **Immediate:** Set `HUB_AUTHORITY_MODE=mock` on Contracts Railway **production** service and redeploy.
2. **Confirm health:**

   ```bash
   curl -sS https://contracts.mactechsolutionsllc.com/api/health
   ```

   Expect `"hubMode": "mock"`.

3. **Confirm mock smoke restored:**

   ```bash
   curl -sS https://contracts.mactechsolutionsllc.com/api/smoke/hub-mock
   ```

   Railway fallback if custom domain hub-mock still times out:

   ```bash
   curl -sS https://contracts-delivery-production.up.railway.app/api/smoke/hub-mock
   ```

   Expect `200` with `"hubMode": "mock"`, `"allowed": true`.

4. **Protected routes:** Pilot users may see mock fixture allow/deny (not production Hub truth) until live is re-enabled.
5. **Hub-side (if needed):** Revoke or rotate the Contracts Hub `ApiKey`; update `MACTECH_HUB_SERVICE_TOKEN` before retry.
6. **Root-cause:** Inspect `snapshot.reason`, Hub `AppRegistry` / entitlement rows, and ApiKey scopes before second attempt.
7. **Document:** Note failure mode in cutover ticket; do not leave production on `live` with a missing or invalid token.

**Do not** roll back by bypassing `resolveAppAccess` or reintroducing Clerk-only authorization.

---

## Pilot sign-off

| Field | Value |
| --- | --- |
| Satellite `appKey` | `contracts-delivery` |
| Railway project / environment | Contracts & Delivery production |
| Pilot org (Clerk + Hub) | |
| Cutover date (UTC) | |
| Verified by | |
| Rollback tested (Y/N) | |

After sign-off, update `docs/LIVE_HUB_AUTHORITY_WIRING.md` pilot table and plan client-portal cutover separately.

---

## What agents must not do

- Flip Railway `HUB_AUTHORITY_MODE` to `live` via automation
- Create or revoke production Hub ApiKeys
- Commit or echo secret values
- Enable live mode on client-portal in the same change set
- Skip BizOps pilot sign-off or staging smoke test before production flip
