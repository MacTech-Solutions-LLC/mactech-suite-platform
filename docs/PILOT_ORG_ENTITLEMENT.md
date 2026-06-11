# Pilot Org ProductEntitlement — BizOps Live Hub

**Phase 3h · Brian-executable · `appKey: bizops` only**

Runbook for enabling Hub `ProductEntitlement` on the **first pilot Clerk org** so live `resolveAppAccess` returns **allow** for entitled BizOps users and **deny** for negative tests.

**Binding:** DR-2026-06-10-01 · DR-2026-06-10-02

**Related:**

- Live pilot cutover: `docs/LIVE_HUB_PILOT_BIZOPS.md` (verification §3.2)
- Hub authority runtime: `docs/HUB_AUTHORITY_CONTRACT_V1.md`
- Consumer snapshot shape: `mactech-suite-workspace-control/docs/HUB_AUTH_CONTRACT_V1_SPEC.md` §3

**Safety:** Agents must **not** execute seed, SQL, or admin writes against production Hub. Brian performs all production enablement. Use placeholder Clerk org IDs in tickets (`org_...`); never commit real production org or entitlement row IDs.

---

## Pilot scope

| Field | Value |
| --- | --- |
| Satellite `appKey` | **`bizops` only** |
| Hub model | `ProductEntitlement` (joined to `CustomerOrganization` + `AppRegistry`) |
| Out of scope | `contracts-delivery`, `client-portal`, and all other app keys |

---

## Prerequisites

Complete **before** creating or toggling the pilot entitlement.

### 1. AppRegistry — `bizops` active

Hub must have an `AppRegistry` row with `appKey` **`bizops`**.

| Field | Required value |
| --- | --- |
| `appKey` | `bizops` |
| `status` | `active` (not `development` / `inactive`) |
| `isInternalOnly` | `false` |
| `requiresOrgContext` | `true` |

**Check (Prisma Studio or SQL read):** filter `AppRegistry` where `appKey = 'bizops'`.

**Command Center UI:** Admin → App Registry → locate **BizOps** → confirm status is **active**.

> Seed on `main` creates `bizops` with `status: development`. For live pilot, Brian must flip `status` to **`active`** before cutover (see `docs/LIVE_HUB_PILOT_BIZOPS.md` Pre-flight).

### 2. Pilot org — `CustomerOrganization` + Clerk binding

Identify the pilot org by **Clerk org ID** (placeholder format: `org_xxxxxxxxxxxxxxxxxxxxxxxx`).

| Field | Required value |
| --- | --- |
| `CustomerOrganization.clerkOrgId` | Pilot Clerk org ID |
| `CustomerOrganization.status` | `active` |
| `CustomerOrganization.isInternalMacTech` | `false` (customer pilot org) |

**Check:** Admin → Customer Organizations → open pilot org → confirm Clerk org ID and status **active**.

### 3. Pilot user — `UserProfile` + `OrgUserAccess`

At least one pilot user who will sign in to BizOps:

| Model | Required state |
| --- | --- |
| `UserProfile` | `status = active`, `clerkUserId` matches Clerk user |
| `OrgUserAccess` | Active membership on pilot `CustomerOrganization` |
| `OrgUserAccess.role` | Any Hub-canonical role with resolvable permissions (e.g. `customer_admin`) |
| `OrgUserAccess.status` | `active` |

Internal MacTech users (`UserProfile.isInternalMacTechUser = true`) bypass org-level `ProductEntitlement` for non-internal apps — use a **customer** pilot org for realistic entitlement testing.

### 4. ServiceIdentity + ApiKey (BizOps satellite)

Required for live `resolveAppAccess` from BizOps; entitlement alone is not sufficient. See `docs/LIVE_HUB_PILOT_BIZOPS.md` Pre-flight (ServiceIdentity, Hub ApiKey).

---

## Enablement — `ProductEntitlement` for `bizops`

Choose **one** path. All paths upsert on `(customerOrganizationId, appRegistryId)`.

### Required row shape

| Field | Pilot value |
| --- | --- |
| `customerOrganizationId` | Hub canonical ID of pilot `CustomerOrganization` |
| `appRegistryId` | Hub ID of `AppRegistry` row where `appKey = 'bizops'` |
| `enabled` | **`true`** |
| `status` | **`active`** (or `trialing`) |
| `plan` | `starter`, `professional`, `enterprise`, or `trial` (informational; not a gate) |
| `startsAt` | `null` or a date **≤ now** |
| `expiresAt` | `null` or a date **> now** (pilot window end) |

Authority evaluator (`lib/hub-authority-core.ts` → `entitlementIsCurrentlyUsable`):

- `enabled` must be `true`
- `status` must be `active` or `trialing`
- `startsAt` must not be in the future
- `expiresAt` must not be in the past

### Option A — Command Center UI (recommended)

1. Sign in to Hub production as a platform admin with `ENTITLEMENTS_MANAGE`.
2. Navigate: **Admin → Customer Organizations →** select pilot org **→ Entitlements** tab.  
   Path pattern: `/admin/customer-orgs/{hubOrgId}/entitlements`
3. Locate the **BizOps** card (`appKey: bizops`).
4. Set **Enabled** on.
5. Set **Status** to **active**.
6. Set **Plan** (e.g. `starter` or `professional`).
7. Set **Starts at** / **Expires at** to cover the pilot window (or leave blank for open-ended).
8. Save. Server action: `upsertProductEntitlement` in `lib/services/entitlement-service.ts` (syncs Clerk `publicMetadata.enabledApps` when `clerkOrgId` is set).

### Option B — Prisma Studio (read/write)

1. Connect Prisma Studio to the **target** Hub database (staging first; production only when Brian approves).
2. Open `AppRegistry` → copy `id` where `appKey = 'bizops'`.
3. Open `CustomerOrganization` → copy `id` where `clerkOrgId = 'org_...'` (pilot org).
4. Open `ProductEntitlement` → create or edit row for that org + app pair.
5. Set fields per table above → save.

### Option C — Local / staging seed reference (not production)

`prisma/seed.ts` registers `bizops` in `AppRegistry` but does **not** seed per-org `ProductEntitlement` rows. For local dev, use Option A against a seeded org or insert via Prisma Studio on a disposable database.

**Do not** run `npx prisma db seed` against production Hub without Brian.

---

## Verification — allow path

After entitlement is enabled and BizOps is on `HUB_AUTHORITY_MODE=live` (see `docs/LIVE_HUB_PILOT_BIZOPS.md`):

### Hub-side (direct)

`POST /api/hub/authority/resolve-app-access` with BizOps service token (`app_authority_resolve` scope). Request body per `docs/HUB_AUTHORITY_CONTRACT_V1.md`:

```json
{
  "clerkUserId": "user_...",
  "appKey": "bizops",
  "requestedOrgId": "org_...",
  "service": { "sourceAppKey": "bizops", "authMethod": "service_token" }
}
```

**Expected live snapshot (allow):**

| Field | Expected |
| --- | --- |
| `decision.allow` | `true` |
| `decision.outcome` | `allow` |
| `decision.denyReason` | `null` |
| `appKey` | `bizops` |
| `appRegistryStatus` | `active` |
| `productEntitlementStatus` | `active` |
| `canonicalOrganizationId` | Non-empty Hub org ID |
| `canonicalHubUserId` | Non-empty Hub user ID |
| `membershipStatus` | `active` |

### Consumer view (`HubAccessSnapshot`)

BizOps maps the live snapshot via `@mactech/hub-client` → `toHubAccessSnapshot` (`HUB_AUTH_CONTRACT_V1_SPEC` §3):

| Field | Expected (allow) |
| --- | --- |
| `allowed` | `true` |
| `user.id` | Non-empty Hub canonical user ID |
| `user.clerkUserId` | Pilot Clerk user ID |
| `tenant.organizationId` | Non-empty Hub canonical org ID |
| `tenant.clerkOrgId` | Pilot Clerk org ID (`org_...`) |
| `membership.status` | `active` |
| `entitlements[0].appKey` | `bizops` |
| `entitlements[0].status` | `active` |
| `reason` | Absent |

### BizOps satellite (end-to-end)

Follow `docs/LIVE_HUB_PILOT_BIZOPS.md` §3.2 allow path:

1. Sign in at `https://bizops.mactechsolutionsllc.com/sign-in` as pilot user in entitled org.
2. Open `/` → HTTP **200**, page shows Hub-authorized org id.
3. Confirm `snapshot.user.id` and `snapshot.tenant.organizationId` are non-empty.

---

## Verification — deny path (negative test)

Use an org or user **without** BizOps `ProductEntitlement` (or with `enabled: false` / `status: suspended` / expired `expiresAt`).

### Hub-side deny reasons

| Condition | `decision.denyReason` |
| --- | --- |
| No `ProductEntitlement` row | `entitlement_missing` |
| `enabled: false` or bad `status` | `entitlement_inactive` |
| `expiresAt` in the past | `entitlement_expired` |

**Expected live snapshot (deny):** `decision.allow = false`, `decision.outcome = deny`, non-null `denyReason`.

**Expected consumer view:**

| Field | Expected (deny) |
| --- | --- |
| `allowed` | `false` |
| `reason` | Hub deny reason (e.g. `entitlement_missing`) |

### BizOps satellite (end-to-end)

Per `docs/LIVE_HUB_PILOT_BIZOPS.md` §3.2 deny path:

1. Sign in as Clerk user **without** BizOps entitlement (or switch to non-pilot org).
2. Open `/` → redirect to `/access-denied` (not silent mock allow).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `entitlement_missing` | No row for org + `bizops` app | Create `ProductEntitlement` (this runbook) |
| `entitlement_inactive` | `enabled: false` or `status` not `active`/`trialing` | Toggle enabled; set status `active` |
| `entitlement_expired` | `expiresAt` ≤ now | Extend or clear `expiresAt` |
| `app_inactive` | `AppRegistry.status` ≠ `active` | Activate `bizops` registry row |
| `membership_missing` / `membership_inactive` | No `OrgUserAccess` | Sync Clerk membership to Hub |
| `organization_inactive` | Org status not `active` | Activate `CustomerOrganization` |
| `role_resolution_failed` | Empty permissions on membership | Set `permissionsJson` or matching `RoleTemplate` |
| BizOps still mock-allows | `HUB_AUTHORITY_MODE=mock` | Complete Railway cutover per pilot doc |

---

## What agents must not do

- Run seed, SQL, or `upsertProductEntitlement` against **production** Hub
- Commit real Clerk org IDs, Hub org IDs, or entitlement row IDs from prod
- Enable entitlements for `contracts-delivery`, `client-portal`, or other apps in this pilot
- Flip `HUB_AUTHORITY_MODE=live` on Railway (Brian only)

---

## Sign-off checklist

| Step | Done |
| --- | --- |
| `AppRegistry` `bizops` → `active` | ☐ |
| Pilot `CustomerOrganization` → `active`, `clerkOrgId` set | ☐ |
| Pilot `OrgUserAccess` → `active` | ☐ |
| `ProductEntitlement` → `enabled`, `status: active`, dates valid | ☐ |
| Hub `resolveAppAccess` allow for pilot user | ☐ |
| Hub `resolveAppAccess` deny for non-entitled user | ☐ |
| BizOps §3.2 allow + deny paths pass on live mode | ☐ |

Record pilot Clerk org ID and cutover date in `docs/LIVE_HUB_PILOT_BIZOPS.md` sign-off table (values stay out of git if sensitive).
