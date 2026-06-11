# Hub CORS Production Apply — Brian Checklist

**Phase 3i · Brian-executable · Hub Railway only**

Step-by-step production apply for Hub `Access-Control-Allow-Origin` allowlisting of greenfield **satellite custom domains**. Agents document; Brian executes Railway env and redeploy.

**Binding:** DR-2026-06-10-01 · DR-2026-06-10-02

**Related:**

- Architecture and rollout order: [docs/HUB_SATELLITE_CORS_CUTOVER.md](./HUB_SATELLITE_CORS_CUTOVER.md)
- Live authority cutover (separate track, after CORS): [docs/LIVE_HUB_CUTOVER_CHECKLIST.md](./LIVE_HUB_CUTOVER_CHECKLIST.md)
- BizOps live pilot: [docs/LIVE_HUB_PILOT_BIZOPS.md](./LIVE_HUB_PILOT_BIZOPS.md)
- 3g-01 smoke evidence: `mactech-suite-workspace-control/local-work-recovery/phase-3g-custom-domain-smoke-verify.md`

**Safety:** No tokens, Railway secret values, or Clerk keys in git, PRs, or agent transcripts.

---

## When to run this

Run **before** `HUB_AUTHORITY_MODE=live` on any satellite whose UI or BFF makes **browser-origin** calls to Hub APIs. Server-side `resolveAppAccess` does not require CORS; browser-mediated paths do.

**Pilot order:** BizOps custom domain first → contracts → portal. Do not batch all three in one CORS window.

---

## Hub deployment target

| Item | Value |
| --- | --- |
| Railway project | Suite / identity-command-center (Hub production) |
| Public origin | `https://www.suite.mactechsolutionsllc.com` |
| Health gate | `GET /api/health` → HTTP 200 |

---

## Origins to allowlist

### Hub self (optional)

| Origin | When needed |
| --- | --- |
| `https://www.suite.mactechsolutionsllc.com` | Only if Command Center or Hub UI makes browser cross-origin calls to Hub API routes (uncommon today). Include if preflight fails from the Hub origin itself. |

### Satellite custom domains (required for browser CORS)

| Origin | `appKey` | Railway default (dual-host window) | 3g-01 gate |
| --- | --- | --- | --- |
| `https://bizops.mactechsolutionsllc.com` | `bizops` | `https://bizops-production-4d93.up.railway.app` | **PASS** — apply first |
| `https://contracts.mactechsolutionsllc.com` | `contracts-delivery` | `https://contracts-production-e4b8.up.railway.app` | **PARTIAL** — defer until B3 hub-mock timeout fixed |
| `https://portal.mactechsolutionsllc.com` | `client-portal` | `https://client-portal-production-aede.up.railway.app` | **PARTIAL** — defer until B4 Clerk protect-rewrite fixed |

Retain each satellite's Railway default URL in the allowlist during the dual-host verification window. Remove Railway defaults only after custom-domain traffic is stable (see [HUB_SATELLITE_CORS_CUTOVER.md](./HUB_SATELLITE_CORS_CUTOVER.md) step 5).

---

## Environment variable (Hub Railway)

| Variable | Format | Example shape (no secrets) |
| --- | --- | --- |
| `MACTECH_HUB_ALLOWED_ORIGINS` | Comma-separated HTTPS origins, no trailing slashes | `https://bizops.mactechsolutionsllc.com,https://bizops-production-4d93.up.railway.app` |

**Notes:**

- Variable name is the documented contract; confirm the deployed Hub build reads it before apply (see cutover doc § "Future extension point").
- Add origins incrementally per pilot step — do not paste all satellites until prior step is verified.
- Do not commit the live value to git.

### Clerk Hub instance (mirror)

Mirror each new browser origin in the **Hub** Clerk Dashboard → **Domains** / allowed origins (3g-02). CORS and Clerk are independent; both must allow the satellite host for sign-in and API flows.

---

## Apply procedure — BizOps pilot (step 1)

Execute only with Brian approval.

### Pre-flight

- [ ] Hub `/api/health` returns 200 on `https://www.suite.mactechsolutionsllc.com`.
- [ ] 3g-01 **PASS** on `bizops.mactechsolutionsllc.com` (health, hub-mock, sign-in, TLS).
- [ ] Hub CORS middleware (or edge allowlist) is deployed on the target Hub build.

### Set allowlist (BizOps only)

- [ ] Open Hub production service in Railway → **Variables**.
- [ ] Set or extend `MACTECH_HUB_ALLOWED_ORIGINS` to include:
  - `https://bizops.mactechsolutionsllc.com`
  - `https://bizops-production-4d93.up.railway.app`
- [ ] Add the same origins to Hub Clerk allowed origins (3g-02).
- [ ] Update Hub `AppRegistry` row for `bizops`: `baseUrl` / `publicUrl` → `https://bizops.mactechsolutionsllc.com`.
- [ ] Redeploy Hub production service; wait for deploy healthy.

### Verify — curl (preflight)

Replace `<SATELLITE_ORIGIN>` with the satellite custom host. Run from any machine with outbound HTTPS.

**Preflight OPTIONS (browser CORS gate):**

```bash
curl -sS -D - -o /dev/null -X OPTIONS \
  "https://www.suite.mactechsolutionsllc.com/api/hub/authority/resolve-app-access" \
  -H "Origin: https://bizops.mactechsolutionsllc.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-mactech-service-token"
```

**Pass signals:**

- HTTP 204 or 200 on OPTIONS.
- Response includes `Access-Control-Allow-Origin: https://bizops.mactechsolutionsllc.com` (or matching request Origin).
- `Access-Control-Allow-Methods` includes `POST` (or `*`).

**Fail signals:**

- OPTIONS 404/405 (route handler missing OPTIONS).
- No `Access-Control-Allow-Origin` header.
- Wrong origin echoed (typo in env var).

**Hub reachability (no CORS):**

```bash
curl -sS -w "\nHTTP:%{http_code}\n" https://www.suite.mactechsolutionsllc.com/api/health
```

### Verify — satellite smoke (no live mode required)

```bash
curl -sS -w "\nHTTP:%{http_code}\n" https://bizops.mactechsolutionsllc.com/api/health
curl -sS -w "\nHTTP:%{http_code}\n" --max-time 30 https://bizops.mactechsolutionsllc.com/api/smoke/hub-mock
```

Expect health 200 and hub-mock 200 while `HUB_AUTHORITY_MODE=mock`.

### Verify — browser (Brian)

1. Sign in at `https://bizops.mactechsolutionsllc.com/sign-in`.
2. Open DevTools → **Network**; load a protected surface or hub-mock route.
3. Confirm no console CORS error (`blocked by CORS policy`).
4. See [HUB_SATELLITE_CORS_CUTOVER.md](./HUB_SATELLITE_CORS_CUTOVER.md) § "Browser network tab" for full pass/fail signals.

### Sign-off

- [ ] Preflight curl pass for BizOps custom origin.
- [ ] Browser network tab pass (no CORS block).
- [ ] AppRegistry `baseUrl` matches custom host.
- [ ] Record completion date in change log / pilot table before `HUB_AUTHORITY_MODE=live` on BizOps.

---

## Apply procedure — contracts (step 2, after BizOps)

**Gate:** BizOps CORS signed off; B3 contracts hub-mock timeout resolved (app-side, not DNS).

- [ ] Append to `MACTECH_HUB_ALLOWED_ORIGINS`:
  - `https://contracts.mactechsolutionsllc.com`
  - `https://contracts-production-e4b8.up.railway.app`
- [ ] Mirror origins in Hub Clerk.
- [ ] Update `AppRegistry` for `contracts-delivery`.
- [ ] Redeploy Hub; run OPTIONS curl with `Origin: https://contracts.mactechsolutionsllc.com`.
- [ ] Run contracts health + hub-mock smoke on custom host.

---

## Apply procedure — portal (step 3, after contracts)

**Gate:** B4 portal Clerk protect-rewrite on `/api/smoke/hub-mock` resolved.

- [ ] Append to `MACTECH_HUB_ALLOWED_ORIGINS`:
  - `https://portal.mactechsolutionsllc.com`
  - `https://client-portal-production-aede.up.railway.app`
- [ ] Mirror origins in Hub Clerk.
- [ ] Update `AppRegistry` for `client-portal`.
- [ ] Redeploy Hub; run OPTIONS curl with `Origin: https://portal.mactechsolutionsllc.com`.
- [ ] Run portal health + hub-mock smoke on custom host.

---

## Retire Railway defaults (step 4)

After custom-domain traffic is stable for a satellite (typically 48h+ clean metrics):

- [ ] Remove that satellite's `*.up.railway.app` origin from `MACTECH_HUB_ALLOWED_ORIGINS`.
- [ ] Remove matching Clerk allowed origin if no longer used.
- [ ] Redeploy Hub; re-run OPTIONS curl on custom origin only.

---

## Rollback

If browser CORS regressions or mis-allowlisting occur:

1. **Immediate:** Remove the last-added satellite origin(s) from `MACTECH_HUB_ALLOWED_ORIGINS` on Hub Railway production.
2. **Redeploy** Hub production service.
3. **Verify** preflight no longer echoes the removed origin:

```bash
curl -sS -D - -o /dev/null -X OPTIONS \
  "https://www.suite.mactechsolutionsllc.com/api/hub/authority/resolve-app-access" \
  -H "Origin: https://bizops.mactechsolutionsllc.com" \
  -H "Access-Control-Request-Method: POST"
```

Expect missing or non-matching `Access-Control-Allow-Origin` after rollback (browser calls will fail CORS — expected until fixed).

4. **Satellite authority:** If live mode was already flipped, set `HUB_AUTHORITY_MODE=mock` on the affected satellite per [docs/LIVE_HUB_PILOT_BIZOPS.md](./LIVE_HUB_PILOT_BIZOPS.md) rollback §.
5. **AppRegistry:** Revert `baseUrl` to Railway default temporarily if custom host is withdrawn.

Rollback does **not** require rotating `MACTECH_HUB_SERVICE_TOKEN` unless token exposure is suspected.

---

## What agents must not do

- Set or change `MACTECH_HUB_ALLOWED_ORIGINS` on Railway from automation
- Deploy Hub or flip production env without Brian
- Commit allowlist values or secrets to git
- Set `HUB_AUTHORITY_MODE=live` on any satellite
- Merge this PR without Brian review

---

## PR / doc verification

- [ ] `npm run build` passes
- [ ] No secret values in diff
- [ ] Origins list covers bizops, contracts, portal custom domains (+ Railway dual-host URLs)
- [ ] Cross-link from [HUB_SATELLITE_CORS_CUTOVER.md](./HUB_SATELLITE_CORS_CUTOVER.md) present
- [ ] Rollback and OPTIONS curl documented
