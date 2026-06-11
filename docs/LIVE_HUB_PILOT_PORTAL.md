# Live Hub Authority Pilot — Client Portal Only

**Phase 3i · `appKey: client-portal` · Brian-executable**

Scoped runbook for live Hub authority cutover on **Client Portal**. BizOps remains the first live pilot; contracts and portal stay on `HUB_AUTHORITY_MODE=mock` until prior pilots sign off and this checklist is executed.

**Binding:** DR-2026-06-10-01 · DR-2026-06-10-02

**Related:**

- General cutover checklist: `docs/LIVE_HUB_CUTOVER_CHECKLIST.md`
- Wiring and env var names: `docs/LIVE_HUB_AUTHORITY_WIRING.md`
- Hub CORS / custom-domain order: `docs/HUB_SATELLITE_CORS_CUTOVER.md` (portal is step 3)
- Client Portal smoke URLs (custom domain): `MacTech-Solutions-LLC/client-portal` → `docs/LIVE_HUB_PILOT.md`
- BizOps first-pilot reference: `docs/LIVE_HUB_PILOT_BIZOPS.md`

**Safety:** No tokens, `.env` values, or Railway secret contents in git, PRs, or agent transcripts. Agents must **not** set `HUB_AUTHORITY_MODE=live` or write `MACTECH_HUB_SERVICE_TOKEN`.

---

## Pilot scope

| Field | Value |
| --- | --- |
| Satellite `appKey` | `client-portal` |
| Railway project | Client Portal (`MacTech-Solutions-LLC/client-portal`) |
| Custom domain (verified 3h) | `https://portal.mactechsolutionsllc.com` |
| Railway default URL | `https://client-portal-production-aede.up.railway.app` |
| Hub production origin | Suite / identity-command-center deployment (`MACTECH_HUB_URL`) |
| Current mode | `mock` (pre-tenant default) |
| Primary protected surface | `/dashboard` (root `/` redirects here) |

**3h post-fix smoke (2026-06-11):** Health, hub-mock, sign-in, and TLS all **PASS** on `portal.mactechsolutionsllc.com`. Hub-mock blocker (Clerk `protect-rewrite` on `/api/smoke/hub-mock`) resolved in client-portal PR [#7](https://github.com/MacTech-Solutions-LLC/client-portal/pull/7) — middleware now exempts smoke routes (see **Clerk middleware** below).

**Pilot order:** Complete BizOps live pilot sign-off and contracts cutover (if scheduled) before portal. Hub CORS step 3 in `docs/HUB_SATELLITE_CORS_CUTOVER.md` applies to `https://portal.mactechsolutionsllc.com`.

---

## Clerk middleware — public smoke routes (required)

Anonymous smoke curls for `/api/health` and `/api/smoke/hub-mock` require these paths in `middleware.ts` `isPublicRoute`:

- `/api/health`
- `/api/smoke/hub-mock`
- `/sign-in(.*)`, `/sign-up(.*)`, `/access-denied` (session flows)

Without the API smoke exemptions, Clerk `protect-rewrite` returns **500** on hub-mock probes (Phase 3g **B4**). Confirm on `main` before cutover:

```typescript
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/access-denied",
  "/api/health",
  "/api/smoke/hub-mock",
]);
```

Hub `client-portal` entitlement is enforced server-side in `requireAppAuthContext` — not in Clerk middleware.

---

## Pre-flight (Hub admin — Brian)

Complete **before** any Railway secret or mode flip. Full detail in `docs/LIVE_HUB_CUTOVER_CHECKLIST.md` Phase 1.

### AppRegistry

- [ ] Confirm Hub `AppRegistry` row for `appKey` **`client-portal`** exists.
- [ ] Set `status` to **`active`** (not `development` / `inactive`).
- [ ] Confirm `isInternalOnly` is **`false`** (customer-facing satellite).
- [ ] Confirm Railway `MACTECH_APP_KEY` is exactly **`client-portal`** (see `canonical-app-keys.md` in control repo).
- [ ] Update `baseUrl` / `publicUrl` to `https://portal.mactechsolutionsllc.com` after DNS stable.

### ServiceIdentity

- [ ] Confirm backing `ServiceIdentity` for `client-portal` exists and `status` is **`active`**.

### Pilot tenant

- [ ] **Pilot tenant** exists in Hub — `CustomerOrganization`, Clerk org binding, and at least one `OrgUserAccess` membership synced.
- [ ] Create or confirm `ProductEntitlement` for the pilot org + `appKey` **`client-portal`**.
- [ ] Entitlement `status` is **`active`**; `startsAt` / `expiresAt` cover the pilot window.

### Hub ApiKey

- [ ] Create Hub `ApiKey` for the Client Portal service identity:
  - **Scopes:** `app_authority_resolve` (required); `audit_ingest` if portal emits audit events.
  - **App tag:** `client-portal` (matches `MACTECH_APP_KEY`).
  - **Status:** `active`; set `expiresAt` per rotation policy.
- [ ] **Script (preferred):** `docs/HUB_SERVICE_TOKEN_ISSUANCE.md` — `railway run npx tsx scripts/issue-app-hub-token.ts client-portal --dry-run` then issue without `--dry-run`.
- [ ] **Manual fallback:** Hub admin → `/admin/api-keys` → Issue API key (same scopes + `client-portal` app tag).
- [ ] Copy plaintext token **once** into deployment secret store as `MACTECH_HUB_SERVICE_TOKEN` (never commit or paste in PR/chat).

### Satellite wiring (code — already on main)

- [ ] Client Portal uses `createHubAuthorityClient` → `resolveAppAccess` on protected routes (`requireAppAuthContext` in `lib/auth/context.ts`).
- [ ] Clerk middleware validates session before Hub call; widget gate (`lib/auth/widget-gate.ts`) is secondary to portal entitlement.
- [ ] `/api/health` and `/api/smoke/hub-mock` remain public in `middleware.ts` (see above).

### Infrastructure

- [ ] Hub production reachable at target `MACTECH_HUB_URL`.
- [ ] Hub CORS / allowed origins include `https://portal.mactechsolutionsllc.com` (+ Railway default during dual-host window) per `docs/HUB_SATELLITE_CORS_CUTOVER.md` step 3.
- [ ] **Staging slot** available on Client Portal Railway project for token smoke test before production flip.

---

## Railway variable rollout (names only)

Apply on **Client Portal Railway project only**. Order matters: URL and token **before** mode flip.

| Step | Variable | Action |
| --- | --- | --- |
| 1 | `MACTECH_HUB_URL` | Set Hub production origin (non-secret). Keep `HUB_AUTHORITY_MODE=mock`. |
| 2 | `MACTECH_APP_KEY` | Confirm value is `client-portal` (non-secret). |
| 3 | `MACTECH_HUB_SERVICE_TOKEN` | Add via Railway **secret UI** (staging first, then production). |
| 4 | `HUB_AUTHORITY_MODE` | Keep **`mock`** until staging smoke passes. |
| 5 | `HUB_AUTHORITY_MODE` | Set to **`live`** on production **only** after staging smoke and Brian sign-off. |

**Do not** flip `HUB_AUTHORITY_MODE=live` until steps 1–3 are complete and staging smoke passes.

### Staging smoke (still `mock` on production)

On Client Portal **staging** deployment only:

1. Set `MACTECH_HUB_URL`, `MACTECH_APP_KEY`, and `MACTECH_HUB_SERVICE_TOKEN` (secret).
2. Temporarily set `HUB_AUTHORITY_MODE=live` on **staging**.
3. Redeploy; confirm process starts (no `createHubAuthorityClient: live mode requires live.serviceToken`).
4. Run verification commands below against staging base URL.
5. Revert staging to `mock` if production cutover is not yet scheduled.

### Production mode flip

1. Set `HUB_AUTHORITY_MODE=live` on Client Portal **production** service.
2. Redeploy.
3. Monitor startup logs for Hub client factory errors.
4. Run production verification below.

---

## Verification (post-cutover)

### 3.1 Health — `hubMode: live`

Anonymous; no auth required.

```bash
curl -sS https://portal.mactechsolutionsllc.com/api/health
```

Expected `200`:

```json
{ "status": "ok", "appKey": "client-portal", "hubMode": "live" }
```

Railway fallback (if custom domain unavailable):

```bash
curl -sS https://client-portal-production-aede.up.railway.app/api/health
```

**Fail:** `hubMode` still `mock` → mode flip not applied or wrong service redeployed.

### 3.2 `resolveAppAccess` smoke — protected route

`/api/smoke/hub-mock` is **mock-only** (returns `skipped` when `hubMode` is `live`). Use authenticated protected surfaces instead.

**Allow path (pilot user):**

1. Sign in at `https://portal.mactechsolutionsllc.com/sign-in` as a user in the **pilot org** with active Hub entitlement for `client-portal`.
2. Open `https://portal.mactechsolutionsllc.com/dashboard`.
3. Expect HTTP **200** and page copy showing Hub-authorized org id (`Hub-authorized dashboard for org {organizationId}`).
4. Confirm `snapshot.user.id` and `snapshot.tenant.organizationId` are non-empty Hub canonical IDs (inspect server logs or temporary debug if needed).

**Deny path (non-entitled user or wrong org):**

1. Sign in as a Clerk user **without** Client Portal entitlement (or switch to a non-pilot org).
2. Open `https://portal.mactechsolutionsllc.com/dashboard`.
3. Expect redirect to `/access-denied` (Hub denied; not silent mock allow).

**Deny path (unauthenticated):**

```bash
curl -sS -o /dev/null -w "HTTP:%{http_code}\n" https://portal.mactechsolutionsllc.com/dashboard
```

Expect redirect to sign-in (302/307) or 401 — not 200 with protected content.

### 3.3 Hub-side signals

- [ ] Hub authority resolve endpoint logs show `sourceAppKey` **`client-portal`**.
- [ ] No unexpected **401** (invalid ApiKey) or **500** from Hub.

### 3.4 Regression guard

- [ ] `npm run build` in `packages/hub-client` passes on the platform branch Client Portal pins.
- [ ] `npm run build` in Client Portal repo passes after cutover.

---

## Rollback

If live cutover fails or causes incorrect access:

1. **Immediate:** Set `HUB_AUTHORITY_MODE=mock` on Client Portal Railway **production** service and redeploy.
2. **Confirm health:**

   ```bash
   curl -sS https://portal.mactechsolutionsllc.com/api/health
   ```

   Expect `"hubMode": "mock"`.

3. **Confirm mock smoke restored:**

   ```bash
   curl -sS https://portal.mactechsolutionsllc.com/api/smoke/hub-mock
   ```

   Expect `200` with `"hubMode": "mock"`, `"allowed": true`.

4. **Protected routes:** Pilot users may see mock fixture allow/deny (not production Hub truth) until live is re-enabled.
5. **Hub-side (if needed):** Revoke or rotate the Client Portal Hub `ApiKey`; update `MACTECH_HUB_SERVICE_TOKEN` before retry.
6. **Root-cause:** Inspect `snapshot.reason`, Hub `AppRegistry` / entitlement rows, and ApiKey scopes before second attempt.
7. **Document:** Note failure mode in cutover ticket; do not leave production on `live` with a missing or invalid token.

**Do not** roll back by bypassing `resolveAppAccess` or reintroducing Clerk-only authorization.

---

## Pilot sign-off

| Field | Value |
| --- | --- |
| Satellite `appKey` | `client-portal` |
| Railway project / environment | Client Portal production |
| Pilot org (Clerk + Hub) | |
| Cutover date (UTC) | |
| Verified by | |
| Rollback tested (Y/N) | |

After sign-off, update `docs/LIVE_HUB_AUTHORITY_WIRING.md` pilot table.

---

## What agents must not do

- Flip Railway `HUB_AUTHORITY_MODE` to `live` via automation
- Create or revoke production Hub ApiKeys
- Commit or echo secret values
- Enable live mode on portal before BizOps (and scheduled prior pilots) sign off
- Remove `/api/smoke/hub-mock` or `/api/health` from Clerk public routes
- Skip staging smoke test before production flip
