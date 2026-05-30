# Hub Audit Ingestion V1

Hub is the canonical suite-wide audit/event ingestion and export authority.
Apps may keep local domain audit details as supporting evidence, but cross-app
audit decisions, export manifests, and tamper-evidence are owned by Hub
`AuditLog`.

## Authority Mapping

- Canonical Hub authority: `AuditLog`, `AuditExportManifest`, `ServiceIdentity`,
  `AppRegistry`, `UserProfile`, `CustomerOrganization`.
- Hub read model / reference: `SuiteObjectReference`.
- App-local domain evidence: app-specific audit detail tables, `SecurityEvent`,
  `IntegrationEvent`, `AppCallEvent`.
- Deprecated legacy model: `AuditEvent`.
- Compatibility shim: `POST /api/audit/ingest` delegates to
  `POST /api/hub/audit/events`.

## Ingestion Contract

`POST /api/hub/audit/events`

Headers:

```http
Content-Type: application/json
X-MacTech-Service-Token: <service token with audit_ingest scope>
X-MacTech-Source-App: proposal
X-Request-Id: req_123
```

Payload:

```json
{
  "sourceAppKey": "proposal",
  "eventType": "proposal.volume.updated",
  "eventCategory": "system",
  "severity": "info",
  "action": "proposal.volume.updated",
  "actorHubUserId": "hub_user_123",
  "actorClerkUserId": "user_123",
  "organizationId": "org_123",
  "tenantOrgId": "org_123",
  "objectType": "ProposalVolume",
  "objectId": "vol_123",
  "objectVersion": "7",
  "objectHash": "sha256:...",
  "suiteObjectReferenceId": null,
  "requestId": "req_123",
  "beforeJson": { "status": "draft" },
  "afterJson": { "status": "red_review" },
  "metadata": {
    "authorityHash": "hub-authority-snapshot-hash",
    "localEvidenceId": "proposal_audit_456"
  }
}
```

Response:

```json
{
  "ok": true,
  "id": "audit_row_id",
  "sequenceNumber": 42,
  "currentHash": "4d8a..."
}
```

Fail closed when the service token is missing/invalid, the source app is not an
active `AppRegistry` row, the `ServiceIdentity` is missing/inactive, the actor
or organization IDs are contradictory, or a supplied `SuiteObjectReference`
does not resolve for the source app.

## Hashing Rules

- Stable JSON serialization sorts object keys recursively.
- `canonicalPayloadHash` excludes `currentHash` and `signature`.
- `sequenceNumber` and `previousHash` are included in the canonical payload.
- `currentHash` hashes the authority version, sequence number, previous hash,
  and canonical payload hash.
- `previousHash` is the prior row `currentHash`; the first row uses the genesis
  hash of 64 zeroes.
- Metadata is redacted before hashing and persistence.

## Append-Only Enforcement

Runtime writes go through `appendHubAuditEvent()` / `writeAuditLog()`.
Service-layer update/delete helpers throw immediately. The migration also adds
a PostgreSQL trigger that rejects `UPDATE` and `DELETE` on `AuditLog` after the
legacy backfill has completed.

Because export batches must not mutate historical events, export manifests are
stored in `AuditExportManifest` and rows are not updated to mark export state.
The nullable `AuditLog.exportBatchId` field is reserved for future compatibility
but is not used by the append-only export flow.

## Signed Export Manifest

`GET /api/hub/audit/export?start=2026-05-01&end=2026-06-01&appKey=proposal`
requires `platform:audit_logs:view`.

Manifest fields:

- `exportBatchId`
- date range
- app filters
- first/last sequence
- first/last hash
- event count
- export hash
- signer identity
- signature
- createdAt

## Consumer Requirements

- Never send caller-provided user/org/role truth as authority. Send
  Hub-resolved IDs or Hub authority snapshot metadata.
- Keep local audit rows only as supporting evidence, linked through
  `metadata.localEvidenceId` or `suiteObjectReferenceId`.
- Treat failed audit ingestion as a compliance event: retry with bounded
  backoff and surface the failure in the local app.
- Use short request IDs end to end so Hub can join audit, authority, and app
  traffic events.

## App Payload Examples

Governance:

```json
{ "sourceAppKey": "governance", "eventType": "governance.bid_no_bid.approved", "eventCategory": "capture", "severity": "warning", "action": "governance.bid_no_bid.approved", "objectType": "BidNoBidDecision", "objectId": "bnb_123" }
```

QMS:

```json
{ "sourceAppKey": "qms", "eventType": "qms.document.revision_approved", "eventCategory": "evidence", "action": "qms.document.revision_approved", "objectType": "ControlledDocument", "objectId": "doc_123", "objectVersion": "4" }
```

Pricing:

```json
{ "sourceAppKey": "pricing", "eventType": "pricing.green_team.approved", "eventCategory": "system", "action": "pricing.green_team.approved", "objectType": "PricingScenario", "objectId": "scenario_123", "metadata": { "proposalId": "prop_123" } }
```

Proposal:

```json
{ "sourceAppKey": "proposal", "eventType": "proposal.final_bundle.generated", "eventCategory": "evidence", "action": "proposal.final_bundle.generated", "objectType": "SubmissionBundle", "objectId": "bundle_123", "objectHash": "sha256:..." }
```

Capture:

```json
{ "sourceAppKey": "capture", "eventType": "capture.package.exported", "eventCategory": "capture", "action": "capture.package.exported", "objectType": "CapturePackage", "objectId": "cap_123" }
```

Training:

```json
{ "sourceAppKey": "training", "eventType": "training.assignment.completed", "eventCategory": "evidence", "action": "training.assignment.completed", "objectType": "TrainingCompletion", "objectId": "tc_123" }
```

Codex / CUI Vault:

```json
{ "sourceAppKey": "codex-cui-vault", "eventType": "vault.evidence.reviewed", "eventCategory": "vault", "severity": "warning", "action": "vault.evidence.reviewed", "objectType": "VaultEvidence", "objectId": "evidence_123", "metadata": { "controlledContent": "CUI" } }
```

MacKali:

```json
{ "sourceAppKey": "mackali", "eventType": "mackali.assessment.completed", "eventCategory": "security", "action": "mackali.assessment.completed", "objectType": "AssessmentRun", "objectId": "run_123" }
```

Cyber Range:

```json
{ "sourceAppKey": "cyber-range", "eventType": "cyber_range.exercise.exported", "eventCategory": "security", "action": "cyber_range.exercise.exported", "objectType": "ExerciseExport", "objectId": "export_123" }
```
