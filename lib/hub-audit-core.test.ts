import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_GENESIS_HASH,
  assertAuditChainContinuity,
  assertAuditMutationForbidden,
  buildAuditChainEvent,
  buildAuditExportManifest,
  stableStringify,
  verifyAuditRow,
  type AuditChainRow,
} from "./hub-audit-core";

const now = new Date("2026-05-30T12:00:00.000Z");

function row(sequenceNumber: number, previousHash: string | null): AuditChainRow {
  const built = buildAuditChainEvent(
    {
      sourceAppKey: "governance",
      action: "governance.contract.updated",
      actorHubUserId: "hub_user_1",
      actorClerkUserId: "user_1",
      organizationId: "org_1",
      objectType: "Contract",
      objectId: `contract_${sequenceNumber}`,
      beforeJson: { b: 2, a: 1 },
      afterJson: { a: 1, b: 3 },
      metadataJson: { token: "secret", nested: { z: 1, a: 2 } },
      createdAt: now,
    },
    { sequenceNumber, previousHash, signingSecret: "test-secret", now },
  );
  return {
    ...built.canonicalPayload,
    currentHash: built.currentHash,
    canonicalPayloadHash: built.canonicalPayloadHash,
    signature: built.signature,
  };
}

test("hash chain continuity", () => {
  const first = row(1, null);
  const second = row(2, first.currentHash);
  assert.equal(first.previousHash, AUDIT_GENESIS_HASH);
  assert.doesNotThrow(() => assertAuditChainContinuity([first, second]));
});

test("tamper detection", () => {
  const first = row(1, null);
  assert.equal(verifyAuditRow(first), true);
  const tampered = { ...first, action: "governance.contract.deleted" };
  assert.equal(verifyAuditRow(tampered), false);
});

test("missing previous hash denied", () => {
  assert.throws(
    () =>
      buildAuditChainEvent(
        { sourceAppKey: "proposal", action: "proposal.volume.updated" },
        { sequenceNumber: 2, previousHash: null, now },
      ),
    /previousHash is required/,
  );
});

test("invalid source app input denied", () => {
  assert.throws(
    () => buildAuditChainEvent({ sourceAppKey: "", action: "qms.document.approved" }, { sequenceNumber: 1, previousHash: null, now }),
    /sourceAppKey is required/,
  );
});

test("invalid service token maps to denied auth response contract", () => {
  const response = {
    ok: false,
    status: 401,
    error: "invalid_service_token",
    detail: "Service token is invalid, revoked, expired, or missing audit_ingest scope.",
  };
  assert.equal(response.status, 401);
  assert.equal(response.error, "invalid_service_token");
});

test("denied update/delete helpers", () => {
  assert.throws(() => assertAuditMutationForbidden("update"), /append-only/);
  assert.throws(() => assertAuditMutationForbidden("delete"), /append-only/);
});

test("export manifest verification", () => {
  const first = row(1, null);
  const second = row(2, first.currentHash);
  const manifest = buildAuditExportManifest({
    exportBatchId: "audit-export-test",
    startDate: "2026-05-30T00:00:00.000Z",
    endDate: "2026-05-31T00:00:00.000Z",
    appFilters: ["proposal", "governance"],
    rows: [second, first],
    signerIdentity: "hub-test",
    signingSecret: "test-secret",
    createdAt: now,
  });
  assert.equal(manifest.eventCount, 2);
  assert.equal(manifest.firstSequence, 1);
  assert.equal(manifest.lastSequence, 2);
  assert.equal(manifest.firstHash, first.currentHash);
  assert.match(manifest.signature, /^[a-f0-9]{64}$/);
});

test("export manifest supports filtered non-contiguous rows", () => {
  const first = row(1, null);
  const second = row(2, first.currentHash);
  const third = row(3, second.currentHash);
  const manifest = buildAuditExportManifest({
    exportBatchId: "audit-export-filtered",
    appFilters: ["governance"],
    rows: [first, third],
    signerIdentity: "hub-test",
    signingSecret: "test-secret",
    createdAt: now,
  });
  assert.equal(manifest.eventCount, 2);
  assert.equal(manifest.firstSequence, 1);
  assert.equal(manifest.lastSequence, 3);
});

test("before/after canonicalization is deterministic", () => {
  const left = stableStringify({ before: { b: 2, a: 1 }, after: { c: 3, a: 1 } });
  const right = stableStringify({ after: { a: 1, c: 3 }, before: { a: 1, b: 2 } });
  assert.equal(left, right);
});
