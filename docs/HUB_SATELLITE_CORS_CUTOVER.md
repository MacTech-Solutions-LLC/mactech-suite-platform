# Hub Satellite CORS Cutover (Custom Domains)

**Phase 3g · docs-only prep · Brian executes Hub/Railway config**

Ensure Hub accepts browser and server calls from greenfield **custom-domain origins** before the first satellite live authority cutover (`HUB_AUTHORITY_MODE=live`).

**Binding:** DR-2026-06-10-01 (Hub owns authorization) · DR-2026-06-10-02 (mock remains default pre-tenant)

**Related:**

- Ordered live cutover: `docs/LIVE_HUB_CUTOVER_CHECKLIST.md`
- 3g-01 smoke evidence: `mactech-suite-workspace-control/local-work-recovery/phase-3g-custom-domain-smoke-verify.md`
- Hub authority wiring: `docs/LIVE_HUB_AUTHORITY_WIRING.md`

**Safety:** No tokens, Railway secret values, or Clerk keys in git, PRs, or agent transcripts.

---

## Hub production reference origin

| Origin | Role |
| --- | --- |
| `https://www.suite.mactechsolutionsllc.com` | Hub production (`MACTECH_HUB_URL` target for satellites) |

Satellites call this origin server-to-server via `@mactech/hub-client`. Browser-origin allowlisting is still required when satellites (or their BFF routes) make cross-origin Hub API calls from the user's browser.

---

## Phase 3g custom-domain origins (minimum)

| Origin | `appKey` | 3g-01 smoke (2026-06-11) |
| --- | --- | --- |
| `https://bizops.mactechsolutionsllc.com` | `bizops` | **PASS** — health, hub-mock, sign-in, TLS |
| `https://contracts.mactechsolutionsllc.com` | `contracts-delivery` | **PARTIAL** — health/sign-in/TLS pass; hub-mock timeout |
| `https://portal.mactechsolutionsllc.com` | `client-portal` | **PARTIAL** — health/sign-in/TLS pass; hub-mock 500 (Clerk protect-rewrite) |

Retain each satellite's Railway default URL (`*.up.railway.app`) in allowlists during the dual-host verification window. Remove only after custom-domain traffic is stable.

---

## Where Hub CORS / allowed origins are configured

### Current codebase state (platform repo)

As of this document, the Hub platform repo has **no centralized env-driven CORS allowlist**. Relevant surfaces:

| Surface | Path / artifact | CORS today | Notes |
| --- | --- | --- | --- |
| Authority resolve | `app/api/hub/authority/resolve-app-access/route.ts` | None | Server-to-server via `x-mactech-service-token`; Clerk middleware skips auth (`middleware.ts` → `/api/hub/authority/(.*)` public) |
| Audit ingest | `app/api/hub/audit/events/route.ts` | None | Server-to-server via service token |
| Object references | `app/api/hub/object-references` | None | Server-to-server via service token |
| Hub client (satellites) | `packages/hub-client/src/client.ts` → `hubFetch()` | N/A (outbound) | Satellites POST to Hub; no browser `Origin` header on this path |
| AppRegistry metadata | `AppRegistry.baseUrl` / `publicUrl` in Prisma | N/A | Command Center launch + health probes; **not** CORS — update after DNS live |
| Edge middleware | `middleware.ts` | N/A | Clerk session gate; does not emit `Access-Control-*` headers |

**Implication:** Greenfield custom domains can reach Hub for **server-side** `resolveAppAccess` today (no CORS preflight). **Browser-direct** cross-origin calls to Hub APIs will fail until Brian adds an explicit allowlist.

### Future extension point (not implemented — names only)

When Hub CORS is added, the expected pattern is:

| Config | Purpose |
| --- | --- |
| `MACTECH_HUB_ALLOWED_ORIGINS` (proposed) | Comma-separated satellite origins for `Access-Control-Allow-Origin` |
| Route-level OPTIONS handler | `app/api/hub/authority/resolve-app-access/route.ts` (and audit/object-reference routes if browser-called) |
| Railway Hub service env | Brian sets allowlist on the Suite / identity-command-center deployment |

Agents document this contract; they do **not** flip Railway vars or deploy CORS middleware without Brian.

### AppRegistry URL alignment (Brian — Command Center)

After custom DNS is live, update each satellite row:

| `appKey` | `baseUrl` / `publicUrl` target |
| --- | --- |
| `bizops` | `https://bizops.mactechsolutionsllc.com` |
| `contracts-delivery` | `https://contracts.mactechsolutionsllc.com` |
| `client-portal` | `https://portal.mactechsolutionsllc.com` |

Greenfield seed fixtures intentionally leave `baseUrl` null until URLs stabilize (`docs/APPREGISTRY_DEV_SEED.md`).

---

## Ordered rollout (bizops pilot first)

Execute only with Brian approval per hostname. **Do not** batch all three satellites in one CORS window.

| Step | Target | Brian actions | Gate |
| --- | --- | --- | --- |
| **0** | Hub | Confirm `https://www.suite.mactechsolutionsllc.com` `/api/health` 200 | Hub reachable |
| **1** | **Pilot — `bizops`** | Add `https://bizops.mactechsolutionsllc.com` (+ Railway default URL) to Hub CORS allowlist; mirror in Clerk Hub instance allowed origins (3g-02); set AppRegistry `baseUrl` | 3g-01 **PASS** on bizops custom host |
| **2** | `contracts-delivery` | Same pattern after bizops CORS verified | Resolve B3 hub-mock timeout (app-side, not DNS) |
| **3** | `client-portal` | Same pattern after contracts step | Resolve B4 Clerk protect-rewrite on `/api/smoke/hub-mock` |
| **4** | Live authority (separate track) | `HUB_AUTHORITY_MODE=live` on **bizops only** after CORS + token smoke | `docs/LIVE_HUB_CUTOVER_CHECKLIST.md` |
| **5** | Retire Railway defaults | Remove `*.up.railway.app` from allowlists after custom host stable | Traffic check |

**Rationale:** BizOps is the recommended first live pilot (`docs/LIVE_HUB_AUTHORITY_WIRING.md`). Hub CORS for the bizops custom origin must be confirmed **before** `HUB_AUTHORITY_MODE=live` on that satellite so browser-mediated Hub calls do not fail at cutover.

---

## Verification steps

### A — Server-side authority (primary path)

Satellites in live mode call Hub from the **server** (Node.js route handler / middleware), not the browser:

1. Set satellite staging env: `MACTECH_HUB_URL=https://www.suite.mactechsolutionsllc.com`, valid `MACTECH_HUB_SERVICE_TOKEN`, `HUB_AUTHORITY_MODE=live` (staging only).
2. Redeploy staging; hit a protected route as pilot user.
3. Expect HTTP 200 with Hub `allowed: true` in the response context (or 403 with Hub `snapshot.reason` for deny paths).
4. Check Hub logs for `sourceAppKey` matching the satellite `MACTECH_APP_KEY`.

No browser CORS headers are involved on this path.

### B — Browser network tab (`resolve-app-access` — describe only)

Use when a satellite exposes a **BFF or diagnostic route** that proxies Hub authority from the browser origin (e.g. live-mode smoke or protected page load):

1. Sign in on the satellite custom origin (e.g. `https://bizops.mactechsolutionsllc.com`).
2. Open DevTools → **Network**; filter `resolve-app-access` or the satellite's Hub proxy route.
3. Load a protected surface that triggers authority resolution.
4. **Pass signals:**
   - Request reaches Hub (`www.suite.mactechsolutionsllc.com`) or the satellite BFF returns a Hub snapshot.
   - No browser console CORS error (`blocked by CORS policy`, missing `Access-Control-Allow-Origin`).
   - Response status 200 (allow) or 403 (Hub deny) — not failed preflight (OPTIONS 4xx) or network error.
5. **Fail signals:**
   - Preflight OPTIONS returns without `Access-Control-Allow-Origin: https://<satellite-host>`.
   - Browser blocks the request before a response body is readable.
   - 401 from Hub (token/config issue — separate from CORS).

Agents describe this procedure only; they do not execute live cutover or paste tokens.

### C — AppRegistry + Command Center

- [ ] Satellite `baseUrl` / `publicUrl` matches custom origin in `/admin/app-registry`.
- [ ] Command Center health probe uses the custom host (not stale Railway default only).

---

## Known blockers (3g-01)

| ID | Blocker | CORS impact |
| --- | --- | --- |
| B1 | Bizops Squarespace CNAME stale (`9txpmywi` vs `688wean6`) | Traffic works today; update DNS before retiring Railway default |
| B2 | Contracts CNAME stale | Same |
| B3 | Contracts hub-mock 30s timeout | App-side; not CORS — defer contracts CORS sign-off |
| B4 | Portal hub-mock 500 (Clerk protect-rewrite) | Middleware/public-route fix; defer portal CORS sign-off |

---

## What agents must not do

- Deploy Hub CORS middleware or flip Railway allowlist vars from automation
- Set `HUB_AUTHORITY_MODE=live` on any satellite
- Commit `MACTECH_HUB_SERVICE_TOKEN` or Clerk secrets
- Change Clerk Dashboard configuration (see 3g-02 for Clerk allowlist docs)

---

## PR verification checklist

- [ ] `npm run build` passes
- [ ] No secret values in diff
- [ ] Checklist references 3g custom hostnames (`bizops`, `contracts`, `portal` apex origins)
- [ ] `docs/LIVE_HUB_CUTOVER_CHECKLIST.md` includes CORS gate before production mode flip
