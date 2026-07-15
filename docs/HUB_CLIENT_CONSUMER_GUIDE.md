# Hub Client Consumer Guide

`@mactech/hub-client` is the required Suite consumer for Hub authority. It replaces app-local authority checks for users, tenants, memberships, roles, permissions, entitlements, app registry lookups, and audit emission.

## Install

Approved channel for the current phase: consume the Hub client through a workspace or pinned git dependency. Do not publish `@mactech/hub-client` until package ownership, npm scope, and release automation are approved.

Current local package name: `@mactech/hub-client`.

Required access model for private MacTech package installs:

- Local development: `NODE_AUTH_TOKEN` or a user-level npm auth token with `read:packages`.
- CI/Railway install: `NODE_AUTH_TOKEN` secret with `read:packages` for the package owner.
- Publishing: not enabled for this package yet.

Add to your app's `.npmrc`:

```
@mactech-solutions-llc:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Do not use npm registry install instructions for `@mactech/hub-client` until publishing is approved. During development, install through the workspace package:

```json
{
  "dependencies": {
    "@mactech/hub-client": "workspace:*"
  }
}
```

See [GitHub Packages Setup](../CONTRIBUTING.md#github-packages-setup) for PAT generation instructions.

### Before publishing v1.0.0

Apps outside this workspace can add this repository as a submodule or checked-out sibling and consume the package by path while publishing is deferred:

```json
{
  "dependencies": {
    "@mactech/hub-client": "file:../mactech-suite-platform/packages/hub-client"
  }
}
```

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
| audit emitters | `emitHubAuditEvent()` to Hub `/api/hub/audit/events`. |

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
- `finance`
- `proposal`
- `growth-capture` — **Opportunity & Capture** (canonical; legacy alias `capture`)
- `training`
- `workspace-gateway`
- `codex-cui-vault`
- `mackali` internal-only
- `cyber-range` internal-only

Legacy compatibility keys currently seeded: `codex`, `quality`, `identity-command-center`.

## Admin: Command Center API keys

Issue keys at **`/admin/api-keys`** → **Issue API key**. Select the minimum scopes the consumer needs; bind the key to the consumer's canonical `appKey` when the service verifies `service.sourceAppKey`.

### Opportunity & Capture (`growth-capture`)

Hub-gated satellite apps require **both** scopes:

| Scope | Endpoint |
| --- | --- |
| `app_authority_resolve` | `POST /api/hub/authority/resolve-app-access` |
| `audit_ingest` | `POST /api/hub/audit/events` |

Set **App tag** to `growth-capture`. Store the plaintext once in the consumer's deployment secret store as `MACTECH_HUB_SERVICE_TOKEN`. The backing `AppRegistry` and `ServiceIdentity` rows for `growth-capture` must be **active** before the consumer can pass Hub authority checks.

## Examples

Compile-checked examples live in `packages/hub-client/examples/consumer-examples.ts` and cover Governance, QMS Express middleware, Pricing, Proposal, Opportunities/Capture, Training, MacKali, and Cyber Range export routes.

## Cache Rules

`resolveHubAppAccess` uses short TTL Hub snapshots. `requireHubAppAccess` fails closed for privileged routes when a snapshot expires. Stale cache can be used only for read-only low-risk routes when explicitly configured.

## Audit

```ts
await hub.emitHubAuditEvent({
  sourceAppKey: "proposal",
  eventType: "proposal.volume.updated",
  eventCategory: "system",
  action: "proposal.volume.updated",
  actorHubUserId: snapshot.canonicalHubUserId,
  actorClerkUserId: snapshot.clerkUserId,
  organizationId: snapshot.canonicalOrganizationId,
  tenantOrgId: snapshot.canonicalOrganizationId,
  objectType: "ProposalVolume",
  objectId: volumeId,
  requestId,
  metadata: { authorityHash: snapshot.cache.authorityHash },
});
```

The call returns `{ id, sequenceNumber, currentHash }`. Audit failures are explicit errors. Do not silently downgrade audit emission for compliance-sensitive routes.
