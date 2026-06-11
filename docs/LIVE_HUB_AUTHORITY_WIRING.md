# Live Hub Authority Wiring (Satellites)

Pre-tenant Speed Mode keeps **`HUB_AUTHORITY_MODE=mock`** on Railway dev until Brian provisions the first tenant and Hub service token. This document describes how satellites switch to **live** Hub authority without bypassing `resolveAppAccess`.

**Binding:** DR-2026-06-10-01 (Hub owns authorization; Clerk session only) · DR-2026-06-10-02 (pre-tenant mock remains default)

**Related specs:**

- Serialization / consumer contract: `mactech-suite-workspace-control/docs/HUB_AUTH_CONTRACT_V1_SPEC.md` §6 (mock vs live)
- Runtime Hub contract: `docs/HUB_AUTHORITY_CONTRACT_V1.md`
- Package API: `packages/hub-client/README.md`

---

## Environment variables (names only)

| Variable | Values / purpose |
| --- | --- |
| `HUB_AUTHORITY_MODE` | `mock` (pre-tenant default) or `live` (first tenant / pilot) |
| `MACTECH_HUB_URL` | Hub base URL for server-to-server calls (e.g. production Hub origin) |
| `MACTECH_HUB_SERVICE_TOKEN` | Hub `ApiKey` plaintext — **deployment secret only**, never committed |
| `MACTECH_APP_KEY` | Satellite canonical app key (per `canonical-app-keys.md` in control repo) |

Optional (local dev only, never in Railway prod):

| Variable | Purpose |
| --- | --- |
| `MACTECH_HUB_CLIENT_UNSAFE_ALLOW_LOCAL_AUTHORITY_OVERRIDE` | Bypass live Hub fetch with a fixed snapshot — **local only** |

Do **not** store token values in git, PR bodies, or agent transcripts. Set them in Railway / secret manager by Brian.

---

## Mock vs live

| Mode | When | Token required | Authority source |
| --- | --- | --- | --- |
| `mock` | Pre-tenant Railway dev, local feature work | No | `@mactech/hub-client` fixtures via `createMockHubAuthority` |
| `live` | First tenant onboarded, pilot, production | Yes (`MACTECH_HUB_SERVICE_TOKEN`) | Hub `POST /api/hub/authority/resolve` |

**Pre-tenant default:** Railway dev projects use `HUB_AUTHORITY_MODE=mock`. Agents must not flip dev projects to `live` without Brian.

---

## Satellite wiring pattern

1. **Authenticate** with Clerk (session / JWT) — identity only.
2. **Authorize** with Hub via `createHubAuthorityClient` → `resolveAppAccess`.
3. If `!snapshot.allowed` → respond **403**; do not fall back to Clerk org roles or local entitlement tables.
4. Attach `HubAccessSnapshot` to request context for domain logic.

### Factory (recommended)

```typescript
import { createHubAuthorityClient } from "@mactech/hub-client";

const mode = process.env.HUB_AUTHORITY_MODE === "live" ? "live" : "mock";

const hub = createHubAuthorityClient({
  mode,
  live:
    mode === "live"
      ? {
          hubBaseUrl: process.env.MACTECH_HUB_URL!,
          sourceAppKey: process.env.MACTECH_APP_KEY!,
          serviceToken: process.env.MACTECH_HUB_SERVICE_TOKEN,
        }
      : undefined,
});

const snapshot = await hub.resolveAppAccess({
  appKey: "training", // must match MACTECH_APP_KEY / canonical key
  clerkUserId,
  clerkOrgId,
  mode: "user_session",
});

if (!snapshot.allowed) {
  // 403 — Hub denied; reason in snapshot.reason
}
```

`createHubAuthorityClient` **fails fast** in live mode when `serviceToken`, `hubBaseUrl`, or `sourceAppKey` is missing — no default token, no silent mock fallback.

See also: `packages/hub-client/examples/live-mode-satellite.ts`.

### Protected route checklist

- [ ] Clerk middleware validates session before Hub call
- [ ] Every protected handler calls `resolveAppAccess` (not Clerk `orgRole` alone)
- [ ] `MACTECH_APP_KEY` matches Hub `AppRegistry` row
- [ ] Live mode: `MACTECH_HUB_SERVICE_TOKEN` set in deployment secrets
- [ ] Mock mode: no token; fixtures exercise deny paths in tests

---

## Service token provisioning (Brian — Hub admin)

Agents **document** this checklist; they do **not** provision production ApiKeys or Railway secrets.

1. **Confirm tenant** — first pilot org exists in Hub (org + membership synced from Clerk).
2. **AppRegistry** — satellite `appKey` row is `active` and not internal-only.
3. **ServiceIdentity** — backing service identity for the app is `active`.
4. **Create Hub ApiKey** (Command Center or Hub admin API):
   - Scopes: `app_authority_resolve`, `audit_ingest` (if app emits audit)
   - App tag: satellite canonical `MACTECH_APP_KEY`
   - Store plaintext **once** in deployment secret store as `MACTECH_HUB_SERVICE_TOKEN`
5. **Railway (per satellite)** — set non-secret vars first (`HUB_AUTHORITY_MODE`, `MACTECH_HUB_URL`, `MACTECH_APP_KEY`), then add token via secret UI (not `railway variables set` in agent logs).
6. **Flip mode** — set `HUB_AUTHORITY_MODE=live` only after token smoke test from a staging slot.
7. **Verify** — protected route returns `allowed: true` for pilot user; deny path returns 403 with Hub reason.

---

## Failure modes

| Symptom | Likely cause | Mitigation |
| --- | --- | --- |
| `createHubAuthorityClient: live mode requires live.serviceToken` at startup | `HUB_AUTHORITY_MODE=live` without `MACTECH_HUB_SERVICE_TOKEN` | Provision token (checklist above) or stay on `mock` for dev |
| `Hub service token is required` on first Hub request | Token passed as empty string / whitespace | Fix secret binding in Railway |
| HTTP **403** from Hub | Inactive app, missing entitlement, wrong org, revoked membership | Inspect `snapshot.reason` / Hub decision; fix Hub data, not local RBAC |
| HTTP **401** from Hub | Invalid or revoked ApiKey | Re-issue key; rotate `MACTECH_HUB_SERVICE_TOKEN` |
| Stale permissions after Hub change | Snapshot **cache TTL** (see `cache.ttlSeconds` on live snapshot) | Wait for TTL expiry or re-fetch; do not cache authority locally beyond Hub TTL |
| App works in mock, fails in live | Fixtures allow paths Hub denies | Add integration test against live staging before cutover |

---

## What agents must not do

- Commit tokens, `.env`, or Railway variable values
- Provision Hub production ApiKeys without Brian
- Switch Railway dev projects to `live` from agent automation
- Run Hub DB migrations
- Bypass `resolveAppAccess` with Clerk-only or local entitlement checks

---

## Verification (PR / release)

- [ ] Docs list env var **names** only (this file)
- [ ] `npm run build` in `packages/hub-client` passes
- [ ] No secret values in git diff
- [ ] Coordinator cross-link added in control repo `HUB_AUTH_CONTRACT_V1_SPEC.md` §6 (if not in same PR)
