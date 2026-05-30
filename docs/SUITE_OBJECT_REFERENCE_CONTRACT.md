# SuiteObjectReference Contract

Hub owns `SuiteObjectReference` as the durable cross-app reference contract. It is not ownership transfer. The owning app remains authoritative for the underlying object, while Hub stores the canonical reference that other Suite apps can use in handoffs, audit rows, exports, and workflow events.

## Authority Map

| Surface | Authority category | Runtime rule |
| --- | --- | --- |
| `SuiteObjectReference` | Hub read model / durable cross-app contract | Hub validates app keys, org IDs, object type, immutable hashes, replacement chains, and emits audit. |
| Underlying domain object | App-local domain data | The app in `owningAppKey` remains the source of truth. Hub does not copy ownership. |
| App keys / service identities / org IDs | Canonical Hub authority | References fail closed when app registry, service identity, or organization records are missing or inactive. |
| Existing `importPayload`, `externalId`, `evidenceLink`, `proposalRef`, `qmsDocRef` style fields | Deprecated legacy model / compatibility shim | Preserve for history; add `suiteObjectReferenceId` beside them and backfill where possible. |

## Model

```ts
type SuiteObjectReference = {
  id: string;
  sourceAppKey: string;
  owningAppKey: string;
  objectType: SuiteObjectType;
  objectId: string;
  objectVersion?: string | null;
  objectHash?: string | null;
  tenantOrgId?: string | null;
  organizationId?: string | null;
  createdByHubUserId?: string | null;
  createdByServiceId?: string | null;
  createdAt: string;
  lastVerifiedAt?: string | null;
  verificationStatus: "pending" | "verified" | "failed" | "deprecated";
  metadataJson?: Record<string, unknown> | null;
  deprecatedAt?: string | null;
  replacedByReferenceId?: string | null;
};
```

## Allowed Object Types

- `capture.opportunity`
- `capture.package`
- `governance.requirement`
- `governance.review`
- `qms.document`
- `qms.document_version`
- `training.assignment`
- `training.completion`
- `pricing.model`
- `pricing.locked_version`
- `proposal.package`
- `codex.evidence_item`
- `codex.evidence_package`
- `mackali.finding`
- `cyberrange.mission_export`

Immutable artifacts and exports require `objectHash`: `capture.package`, `qms.document_version`, `pricing.locked_version`, `proposal.package`, `codex.evidence_package`, and `cyberrange.mission_export`.

## APIs

All endpoints require a service token with `object_reference_write`, an active `AppRegistry` row, and an active `ServiceIdentity` row for the caller. Send the token as `X-MacTech-Service-Token` or `Authorization: Bearer`.

### Create

`POST /api/hub/object-references`

```json
{
  "sourceAppKey": "proposal",
  "owningAppKey": "pricing",
  "objectType": "pricing.locked_version",
  "objectId": "price-volume-2026-05-30",
  "objectVersion": "v3",
  "objectHash": "sha256:8f14e45fceea167a5a36dedd4bea2543",
  "tenantOrgId": "org_hub_123",
  "createdByHubUserId": "user_hub_123",
  "metadataJson": {
    "proposalId": "prop_123",
    "handoff": "green-team-approved"
  }
}
```

### Read

`GET /api/hub/object-references/:id`

Caller must be either the source app or owning app for the reference.

### Verify

`POST /api/hub/object-references/verify`

```json
{
  "id": "ref_123",
  "sourceAppKey": "pricing",
  "objectHash": "sha256:8f14e45fceea167a5a36dedd4bea2543",
  "verificationStatus": "verified"
}
```

### Deprecate

`POST /api/hub/object-references/:id/deprecate`

```json
{
  "sourceAppKey": "proposal",
  "replacedByReferenceId": "ref_456",
  "metadataJson": {
    "reason": "final package was superseded before submission"
  }
}
```

Deprecation requires `replacedByReferenceId`. Deprecated references must not be used as active handoffs.

## App Examples

| App | Owning object example | Cross-app use |
| --- | --- | --- |
| Capture | `capture.package` with solicitation hash | Proposal imports a Capture Package without copying opportunity authority. |
| Governance | `governance.requirement` | Proposal cites a readiness requirement snapshot; Governance remains authoritative. |
| QMS | `qms.document_version` | Governance links controlled evidence; QMS keeps document control. |
| Training | `training.completion` | Governance readiness links completion evidence; Training owns completion details. |
| Pricing | `pricing.locked_version` | Proposal attaches an approved price volume without editing pricing math. |
| Proposal | `proposal.package` | Governance receives award/loss handoff and package manifest. |
| Codex | `codex.evidence_package` | Governance references CMMC evidence metadata without rendering CUI broadly. |
| MacKali | `mackali.finding` | Governance tracks internal finding remediation without copying scanner output. |
| Cyber Range | `cyberrange.mission_export` | Training or Governance links a signed exercise export. |

## Migration Strategy

1. Add nullable `suiteObjectReferenceId` fields beside existing JSON/string references.
2. Backfill rows where the owning app, object type, object ID, tenant org, and immutable hash can be derived safely.
3. Leave legacy fields read-only for historical rendering until every consumer has moved to Hub references.
4. Route new handoffs through `SuiteObjectReference` immediately.
5. Emit Hub audit events for reference creation, verification, deprecation, and replacement.

## Backfill Notes

Search targets for migrations and backfills:

- `importPayload`
- `importSource`
- `capturePackageJson`
- `sourceId`
- `externalId`
- `evidenceLink`
- `proposalRef`
- `qmsDocRef`

Backfills must fail closed when the owning app, object type, object ID, or tenant organization cannot be resolved. Store unresolved rows in a manual-review report; do not invent canonical IDs.

## Do Not Copy Authority

Consumers must not copy another app's ownership facts into local authority tables. Store only Hub IDs, `SuiteObjectReference.id`, local read models, or immutable local domain events. If an app needs fresh truth, it must call the owning app or Hub contract instead of trusting stale JSON.
