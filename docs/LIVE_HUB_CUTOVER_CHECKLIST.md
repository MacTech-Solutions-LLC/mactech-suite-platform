# Live Hub Cutover Checklist

Ordered steps for flipping a satellite from **`HUB_AUTHORITY_MODE=mock`** to **`live`** Hub authority. Brian executes Hub admin and Railway secret steps; agents document and verify only.

**Binding:** DR-2026-06-10-01 · DR-2026-06-10-02

**Related:**

- Wiring pattern and env var names: `docs/LIVE_HUB_AUTHORITY_WIRING.md`
- Satellite CORS / custom-domain origins: `docs/HUB_SATELLITE_CORS_CUTOVER.md`
- Runtime contract: `docs/HUB_AUTHORITY_CONTRACT_V1.md`
- Consumer adapter: `packages/hub-client/README.md`
- Per-satellite pilot runbooks: `docs/LIVE_HUB_PILOT_BIZOPS.md` · `docs/LIVE_HUB_PILOT_PORTAL.md`

**Safety:** No tokens, `.env` values, or Railway secret contents in git, PRs, or agent transcripts.

---

## Preconditions (before any satellite cutover)

- [ ] **First pilot tenant** exists in Hub — `CustomerOrganization`, Clerk org binding, and at least one `OrgUserAccess` membership synced.
- [ ] **Hub production** is reachable at the target `MACTECH_HUB_URL` (Suite / identity-command-center deployment).
- [ ] **Satellite** uses `createHubAuthorityClient` → `resolveAppAccess` on every protected route (no Clerk-only RBAC bypass).
- [ ] **Staging slot** available on the satellite Railway project for token smoke test before production flip.

---

## Phase 1 — Hub data (Brian, Command Center / Hub admin)

### 1.1 AppRegistry

- [ ] Confirm satellite `appKey` row exists in Hub `AppRegistry`.
- [ ] Set `status` to **`active`** (not `development` / `inactive`).
- [ ] Confirm `isInternalOnly` is **`false`** for customer-facing satellites.
- [ ] Confirm `MACTECH_APP_KEY` in Railway matches this `appKey` exactly (see `canonical-app-keys.md` in control repo).

### 1.2 ServiceIdentity

- [ ] Confirm backing `ServiceIdentity` for the satellite `appKey` exists and `status` is **`active`**.

### 1.3 Product entitlement (pilot org)

- [ ] Create or confirm `ProductEntitlement` for the pilot org + satellite `appKey`.
- [ ] Entitlement `status` is **`active`**; `startsAt` / `expiresAt` cover the pilot window.

### 1.4 Hub ApiKey

- [ ] Create Hub `ApiKey` for the satellite service identity:
  - **Scopes:** `app_authority_resolve` (required); `audit_ingest` if the app emits audit events.
  - **App tag:** satellite canonical `MACTECH_APP_KEY`.
  - **Status:** `active`; set `expiresAt` per rotation policy.
- [ ] Copy plaintext token **once** into deployment secret store as `MACTECH_HUB_SERVICE_TOKEN` (never commit or paste in PR/chat).

---

## Phase 2 — Railway env rollout (mock → live)

Apply per satellite project. Order matters: secrets and smoke test **before** mode flip.

### 2.1 Non-secret variables (safe to set while still on mock)

| Variable | Value |
| --- | --- |
| `MACTECH_HUB_URL` | Hub production origin (e.g. Suite base URL) |
| `MACTECH_APP_KEY` | Satellite canonical app key |
| `HUB_AUTHORITY_MODE` | Keep **`mock`** until Phase 2.4 |

- [ ] Set `MACTECH_HUB_URL` and `MACTECH_APP_KEY` on staging and production services.
- [ ] Leave `HUB_AUTHORITY_MODE=mock` until token smoke test passes.

### 2.2 Secret variable

- [ ] Add `MACTECH_HUB_SERVICE_TOKEN` via Railway secret UI (not CLI logs, not git).
- [ ] Bind to the correct service / environment (staging first).

### 2.3 Staging smoke test (still mock on prod)

On a **staging** deployment slot or one-off shell with live env injected:

- [ ] Temporarily set `HUB_AUTHORITY_MODE=live` on staging only.
- [ ] Redeploy; confirm process starts (no `createHubAuthorityClient: live mode requires live.serviceToken`).
- [ ] Call a protected route as **pilot user** → expect `allowed: true` and valid `HubAccessSnapshot`.
- [ ] Call as **non-entitled user** or wrong org → expect **403** with Hub `snapshot.reason` (not Clerk fallback).
- [ ] Revert staging to `mock` if prod cutover is not yet scheduled.

### 2.3a Hub CORS and custom-domain origins (required before production live flip)

Complete **before** Phase 2.4 on the pilot satellite. Full runbook: `docs/HUB_SATELLITE_CORS_CUTOVER.md`.

**Pilot order:** `bizops` first — do not flip contracts or portal in the same window.

| Pilot `appKey` | Custom origin (Phase 3g) |
| --- | --- |
| `bizops` | `https://bizops.mactechsolutionsllc.com` |
| `contracts-delivery` (later) | `https://contracts.mactechsolutionsllc.com` |
| `client-portal` (later) | `https://portal.mactechsolutionsllc.com` |

- [ ] **3g-01 gate:** Custom-domain smoke **PASS** on the pilot host (bizops: health, hub-mock, sign-in, TLS).
- [ ] Brian adds the pilot satellite custom origin (+ Railway default URL during dual-host window) to Hub CORS / allowed-origin config on the Suite deployment.
- [ ] Hub `AppRegistry` `baseUrl` / `publicUrl` updated to the custom origin for the pilot `appKey`.
- [ ] Browser network tab check (describe only in runbook): no CORS preflight failure when protected routes trigger `resolve-app-access` from the satellite origin.
- [ ] Leave `HUB_AUTHORITY_MODE=mock` on production until the above passes.

### 2.4 Production mode flip

- [ ] Confirm Phase 2.3a (Hub CORS + custom-domain origins) is complete for this satellite.
- [ ] Set `HUB_AUTHORITY_MODE=live` on production service.
- [ ] Redeploy satellite.
- [ ] Monitor startup logs for Hub client factory errors.

---

## Phase 3 — Verification (post-cutover)

### 3.1 Allow path

- [ ] Pilot user with active membership + entitlement reaches protected surfaces (HTTP 200).
- [ ] `snapshot.user.id` and `snapshot.tenant.organizationId` are non-empty Hub canonical IDs.

### 3.2 Deny paths

- [ ] User without entitlement → 403, reason e.g. `entitlement_missing`.
- [ ] Revoked / inactive membership → 403 with Hub reason.
- [ ] Wrong org context → 403; no silent allow from mock fixtures.

### 3.3 Hub-side signals

- [ ] Hub authority resolve endpoint logs show `sourceAppKey` matching satellite.
- [ ] No unexpected **401** (invalid ApiKey) or **500** from Hub.

### 3.4 Regression guard

- [ ] `npm run build` in `packages/hub-client` passes on the platform branch satellites pin.
- [ ] Satellite integration tests (if any) updated to cover live deny paths, not only mock fixtures.

---

## Rollback

If live cutover fails or causes incorrect access:

1. **Immediate:** Set `HUB_AUTHORITY_MODE=mock` on the affected Railway service and redeploy.
2. **Confirm:** Protected routes use mock fixtures again; pilot users may see fixture allow/deny (not production Hub truth).
3. **Hub-side (if needed):** Revoke or rotate the satellite `ApiKey`; update `MACTECH_HUB_SERVICE_TOKEN` before retry.
4. **Root-cause:** Inspect `snapshot.reason`, Hub `AppRegistry` / entitlement rows, and ApiKey scopes before second attempt.
5. **Document:** Note failure mode in cutover ticket; do not leave production on `live` with a missing or invalid token.

**Do not** roll back by bypassing `resolveAppAccess` or reintroducing Clerk-only authorization.

---

## Per-satellite sign-off

| Field | Value |
| --- | --- |
| Satellite `appKey` | |
| Railway project / environment | |
| Pilot org (Clerk + Hub) | |
| Cutover date (UTC) | |
| Verified by | |
| Rollback tested (Y/N) | |

---

## What agents must not do

- Flip Railway `HUB_AUTHORITY_MODE` to `live` via automation
- Create or revoke production Hub ApiKeys
- Commit or echo secret values
- Skip staging smoke test before production flip
- Bypass `resolveAppAccess` during rollback or debugging
