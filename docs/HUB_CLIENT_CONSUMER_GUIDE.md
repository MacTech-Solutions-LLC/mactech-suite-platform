# Hub Client Consumer Guide

`@mactech/hub-client` is the required Suite consumer for Hub authority. It replaces app-local authority checks for users, tenants, memberships, roles, permissions, entitlements, app registry lookups, and audit emission.

## Install

This PR implements a local package at `packages/hub-client`. Publishing is intentionally not invented here. Options:

- publish `@mactech/hub-client` to the MacTech private npm registry once registry ownership is decided
- consume via workspace or git dependency during phased migration
- vendor only compiled package artifacts for apps that cannot join the workspace yet

Required app environment:

```bash
MACTECH_HUB_URL=https://www.suite.mactechsolutionsllc.com
MACTECH_SOURCE_APP_KEY=proposal
MACTECH_HUB_SERVICE_TOKEN=<Hub ApiKey scoped app_authority_resolve and audit_ingest>
```

Unsafe local override is available only when explicitly set:

```bash
MACTECH_HUB_CLIENT_UNSAFE_ALLOW_LOCAL_AUTHORITY_OVERRIDE=true
```

Do not enable that variable outside local development.

## Basic Usage

```ts
import { createHubServiceClient } from "@mactech/hub-client";

const hub = createHubServiceClient({
  hubBaseUrl: process.env.MACTECH_HUB_URL!,
  sourceAppKey: "proposal",
  serviceToken: process.env.MACTECH_HUB_SERVICE_TOKEN!,
});

const snapshot = await hub.requireHubAppAccess({
  clerkUserId,
  appKey: "proposal",
  requestedOrgId,
  requestId,
});
```

Use `snapshot.canonicalHubUserId`, `snapshot.canonicalOrganizationId`, `snapshot.membershipId`, `snapshot.memberRoles`, and `snapshot.resolvedPermissions` as the request authority context.

## Replace Local Helpers

| Existing local path | Replacement |
| --- | --- |
| `requireAuth()` | `requireHubAppAccess({ clerkUserId, appKey, requestedOrgId })` |
| `requireRole(role)` | Check `snapshot.memberRoles` after Hub snapshot verification. |
| `requirePermission(permission)` | Check `snapshot.resolvedPermissions` after Hub snapshot verification. |
| tenant resolver | Use `snapshot.canonicalOrganizationId`; local tenant ids become read-model mappings only. |
| entitlement checks | Use Hub `decision.allow` and `productEntitlementStatus`. |
| app registry checks | Hub endpoint fails closed on missing/inactive/internal-only app rows. |
| audit emitters | `emitHubAuditEvent()` to Hub `/api/audit/ingest`. |

## App Migration Steps

1. Add `@mactech/hub-client`.
2. Create a Hub `ApiKey` scoped to `app_authority_resolve` and `audit_ingest`, bound to the app's `appKey`.
3. Confirm the app has active `AppRegistry` and `ServiceIdentity` rows.
4. Replace protected route guards with `requireHubAppAccess`.
5. Convert local user/org/membership/role/entitlement tables to read models, TTL caches, domain mappings, or deprecated compatibility tables.
6. Replace local audit writes with `emitHubAuditEvent`.
7. Add negative tests for revoked user, suspended org, expired entitlement, inactive app, inactive membership, stale snapshot, and invalid service token.

## App Keys

- `hub`
- `governance`
- `qms`
- `pricing`
- `proposal`
- `capture`
- `training`
- `workspace-gateway`
- `codex-cui-vault`
- `mackali` internal-only
- `cyber-range` internal-only

Legacy compatibility keys currently seeded: `codex`, `quality`, `identity-command-center`.

## Examples

Compile-checked examples live in `packages/hub-client/examples/consumer-examples.ts` and cover Governance, QMS Express middleware, Pricing, Proposal, Opportunities/Capture, Training, MacKali, and Cyber Range export routes.

## Cache Rules

`resolveHubAppAccess` uses short TTL Hub snapshots. `requireHubAppAccess` fails closed for privileged routes when a snapshot expires. Stale cache can be used only for read-only low-risk routes when explicitly configured.

## Audit

```ts
await hub.emitHubAuditEvent({
  appKey: "proposal",
  eventType: "proposal.volume.updated",
  eventCategory: "system",
  action: "Updated technical volume",
  actorClerkUserId,
  customerOrgId,
  requestId,
});
```

Audit failures are explicit errors. Do not silently downgrade audit emission for compliance-sensitive routes.
