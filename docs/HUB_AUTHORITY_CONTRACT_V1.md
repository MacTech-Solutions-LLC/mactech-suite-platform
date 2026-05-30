# Hub Authority Contract v1

Hub / `mactech-suite-platform` is the Suite control plane and canonical authority for users, organizations, memberships, roles, permissions, app registry, entitlements, service identity, and suite-wide audit/event ingestion.

## Authority Map

| Surface | Category | Runtime rule |
| --- | --- | --- |
| `UserProfile` | Canonical Hub authority | Canonical user profile and Clerk binding. |
| `CustomerOrganization` | Canonical Hub authority | Canonical tenant/customer organization. |
| `OrgUserAccess` | Canonical Hub authority | Canonical membership, member role, and resolved org permissions. |
| `ProductEntitlement` | Canonical Hub authority | Canonical app entitlement, plan, dates, and status. |
| `AppRegistry` | Canonical Hub authority | Canonical Suite app registry and internal-only flag. |
| `RoleTemplate` | Canonical Hub authority | Canonical role-to-permission template fallback. |
| `ApiKey` | Canonical Hub authority | Service token hash, scopes, app binding, expiry, revocation. |
| `ServiceIdentity` | Canonical Hub authority | Source app service identity and rotation metadata. |
| `AuditLog` / `SecurityEvent` | Canonical Hub authority | Suite-wide audit and security event ingestion. |
| `Tenant` / `User` / `Membership` / `AuditEvent` | Deprecated legacy model | Historical compatibility only; no new runtime authority writes. |
| `lib/auth/adapter.ts` / `lib/db/withTenant.ts` | Compatibility shim to be removed later | Legacy tenant resolver for old callers until app repos migrate. |

## Endpoint

`POST /api/hub/authority/resolve-app-access`

Authentication: service token required. Send the token in `X-MacTech-Service-Token` or `Authorization: Bearer <token>`. The backing `ApiKey` row must have `app_authority_resolve`, `status=active`, a non-expired `expiresAt`, and `appKey` equal to `service.sourceAppKey`. The source app must also have active `AppRegistry` and `ServiceIdentity` rows.

## Request

```json
{
  "clerkUserId": "user_123",
  "appKey": "governance",
  "requestedOrgId": "org_canonical_or_clerk_or_slug",
  "tenantOrgId": null,
  "requestId": "req_123",
  "sourceIp": "203.0.113.10",
  "userAgent": "consumer-app/1.0",
  "service": {
    "sourceAppKey": "proposal",
    "authMethod": "service_token"
  }
}
```

## Response

Allowed requests return `200`; denied authority decisions return `403` with a signed snapshot.

```json
{
  "ok": true,
  "snapshot": {
    "canonicalHubUserId": "hub_user_id",
    "clerkUserId": "user_123",
    "userStatus": "active",
    "canonicalOrganizationId": "org_id",
    "organizationStatus": "active",
    "membershipId": "membership_id",
    "membershipStatus": "active",
    "memberRoles": ["customer_admin"],
    "resolvedPermissions": ["org:dashboard:view"],
    "appKey": "governance",
    "appRegistryStatus": "active",
    "productEntitlementStatus": "active",
    "entitlementStartsAt": "2026-01-01T00:00:00.000Z",
    "entitlementExpiresAt": "2027-01-01T00:00:00.000Z",
    "planTier": "enterprise",
    "cache": {
      "issuedAt": "2026-05-30T12:00:00.000Z",
      "expiresAt": "2026-05-30T12:01:00.000Z",
      "ttlSeconds": 60,
      "authorityVersion": 1770000000000,
      "authorityHash": "sha256"
    },
    "decision": {
      "allow": true,
      "outcome": "allow",
      "denyReason": null,
      "requiredRemediation": null
    }
  }
}
```

## Deny Reasons

`service_identity_invalid`, `source_app_unknown`, `app_registry_missing`, `app_inactive`, `internal_app_forbidden`, `user_missing`, `user_inactive`, `org_context_required`, `organization_missing`, `organization_inactive`, `membership_missing`, `membership_inactive`, `entitlement_missing`, `entitlement_inactive`, `entitlement_expired`, `role_resolution_failed`.

Fail closed on any unknown status, missing canonical row, expired entitlement, stale/expired snapshot, invalid service token, inactive source app, inactive requested app, suspended org, revoked user, inactive membership, or role resolution failure.

## Cache Rules

Snapshots default to `60` seconds. Privileged routes must reject expired snapshots. Read-only low-risk routes may use stale cache only when the consuming app explicitly opts in. Consumers must verify `authorityHash`, `decision.allow`, and `cache.expiresAt`.

`authorityVersion` is derived from canonical authority version fields and update timestamps. `authorityHash` changes when user status, org status, membership, entitlement, app registry, or relevant authority timestamps change.

## Migration And Backfill

Migration `20260530000000_hub_authority_contract_v1` adds:

- `ServiceIdentity`
- `ApiKeyScope.app_authority_resolve`
- authority version columns on canonical authority tables
- status enum values for revoked/inactive/deleted users, inactive/unpaid orgs, and inactive/hidden/suspended apps
- database comments marking legacy tenancy tables deprecated

Seed/backfill updates `AppRegistry` and `ServiceIdentity` for: Hub, Governance, QMS, Pricing, Proposal, Opportunities/Capture, Training, Workspace Gateway, Codex/CUI Vault, MacKali, and Cyber Range. MacKali and Cyber Range are internal-only. Legacy `codex`, `quality`, and `identity-command-center` app keys remain compatibility rows.

## What This Replaces

- `/api/v1/users/{clerkUserId}/access` and `/api/v1/orgs/{clerkOrgId}` remain compatibility read APIs for phased consumers, but protected Suite apps should move to `/api/hub/authority/resolve-app-access`.
- `app-launch/[appKey]` now uses the same Hub authority evaluator instead of a separate entitlement-only decision path.
- `lib/auth/adapter.ts` and `lib/db/withTenant.ts` are explicitly deprecated legacy tenant shims; they are not the Suite authority runtime.
- App-local `requireAuth`, `requireRole`, `requirePermission`, tenant resolver, entitlement checks, app registry checks, and audit emitters are replaced by `@mactech/hub-client` calls.

## Consumer Requirements

Consumers must use `@mactech/hub-client` or reproduce the same rules:

- Call Hub before protected route execution.
- Never trust caller-provided user/org/role/permission/entitlement metadata without Hub verification.
- Treat local authz tables as read models, TTL caches, domain mappings, or immutable local domain events only.
- Emit audit through Hub `AuditLog` ingestion.
- Fail closed on missing Hub response, invalid hash, expired cache, denied decision, unknown source app, or inactive app.
