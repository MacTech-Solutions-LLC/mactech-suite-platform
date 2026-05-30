import { createHash, createHmac, randomUUID } from "crypto";

export const AUDIT_GENESIS_HASH = "0".repeat(64);
export const AUDIT_HASH_ALGORITHM = "sha256";
export const AUDIT_AUTHORITY_VERSION = "hub-audit-v1";

export type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike | undefined };

export interface CanonicalAuditEventInput {
  id?: string;
  sourceAppKey: string;
  eventType?: string | null;
  eventCategory?: string | null;
  severity?: string | null;
  action: string;
  actorHubUserId?: string | null;
  actorClerkUserId?: string | null;
  actorEmail?: string | null;
  actorServiceId?: string | null;
  organizationId?: string | null;
  tenantOrgId?: string | null;
  appRegistryId?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  objectVersion?: string | null;
  objectHash?: string | null;
  suiteObjectReferenceId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: unknown;
  createdAt?: Date | string | null;
}

export interface AuditChainBuildOptions {
  sequenceNumber: number;
  previousHash: string | null;
  signingSecret?: string | null;
  now?: Date;
}

export interface CanonicalAuditPayload {
  authorityVersion: string;
  id: string;
  sequenceNumber: number;
  previousHash: string;
  actorHubUserId: string | null;
  actorClerkUserId: string | null;
  actorEmail: string | null;
  actorServiceId: string | null;
  organizationId: string | null;
  tenantOrgId: string | null;
  sourceAppKey: string;
  action: string;
  objectType: string | null;
  objectId: string | null;
  objectVersion: string | null;
  objectHash: string | null;
  suiteObjectReferenceId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  metadataJson: unknown;
  createdAt: string;
}

export interface BuiltAuditChainEvent {
  id: string;
  sequenceNumber: number;
  previousHash: string;
  currentHash: string;
  canonicalPayloadHash: string;
  signature: string | null;
  canonicalPayload: CanonicalAuditPayload;
  createdAt: Date;
}

export interface AuditChainRow extends CanonicalAuditPayload {
  currentHash: string;
  canonicalPayloadHash: string;
  signature?: string | null;
}

export interface AuditExportManifestInput {
  exportBatchId: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  appFilters?: string[] | null;
  rows: AuditChainRow[];
  signerIdentity: string;
  signingSecret?: string | null;
  createdAt?: Date | string | null;
}

export interface AuditExportManifestOutput {
  exportBatchId: string;
  startDate: string | null;
  endDate: string | null;
  appFilters: string[];
  firstSequence: number | null;
  lastSequence: number | null;
  firstHash: string | null;
  lastHash: string | null;
  eventCount: number;
  exportHash: string;
  signerIdentity: string;
  signature: string;
  createdAt: string;
}

export function buildAuditChainEvent(
  input: CanonicalAuditEventInput,
  options: AuditChainBuildOptions,
): BuiltAuditChainEvent {
  if (!input.sourceAppKey) throw new Error("sourceAppKey is required.");
  if (!input.action) throw new Error("action is required.");
  if (!Number.isInteger(options.sequenceNumber) || options.sequenceNumber < 1) {
    throw new Error("sequenceNumber must be a positive integer.");
  }
  const previousHash =
    options.sequenceNumber === 1
      ? options.previousHash ?? AUDIT_GENESIS_HASH
      : options.previousHash;
  if (!previousHash) {
    throw new Error("previousHash is required for non-genesis audit events.");
  }

  const createdAt = toDate(input.createdAt ?? options.now ?? new Date());
  const payload: CanonicalAuditPayload = {
    authorityVersion: AUDIT_AUTHORITY_VERSION,
    id: input.id ?? randomUUID(),
    sequenceNumber: options.sequenceNumber,
    previousHash,
    actorHubUserId: input.actorHubUserId ?? null,
    actorClerkUserId: input.actorClerkUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    actorServiceId: input.actorServiceId ?? null,
    organizationId: input.organizationId ?? null,
    tenantOrgId: input.tenantOrgId ?? input.organizationId ?? null,
    sourceAppKey: input.sourceAppKey,
    action: input.action,
    objectType: input.objectType ?? null,
    objectId: input.objectId ?? null,
    objectVersion: input.objectVersion ?? null,
    objectHash: input.objectHash ?? null,
    suiteObjectReferenceId: input.suiteObjectReferenceId ?? null,
    requestId: input.requestId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    beforeJson: canonicalJsonValue(input.beforeJson),
    afterJson: canonicalJsonValue(input.afterJson),
    metadataJson: canonicalJsonValue(redactAuditMetadata(input.metadataJson)),
    createdAt: createdAt.toISOString(),
  };

  const canonicalPayloadHash = sha256(stableStringify(payload));
  const currentHash = sha256(
    stableStringify({
      authorityVersion: AUDIT_AUTHORITY_VERSION,
      sequenceNumber: payload.sequenceNumber,
      previousHash: payload.previousHash,
      canonicalPayloadHash,
    }),
  );
  return {
    id: payload.id,
    sequenceNumber: payload.sequenceNumber,
    previousHash: payload.previousHash,
    currentHash,
    canonicalPayloadHash,
    signature: signAuditHash(currentHash, options.signingSecret ?? null),
    canonicalPayload: payload,
    createdAt,
  };
}

export function auditRowToCanonicalPayload(row: AuditChainRow): CanonicalAuditPayload {
  return {
    authorityVersion: row.authorityVersion ?? AUDIT_AUTHORITY_VERSION,
    id: row.id,
    sequenceNumber: row.sequenceNumber,
    previousHash: row.previousHash,
    actorHubUserId: row.actorHubUserId ?? null,
    actorClerkUserId: row.actorClerkUserId ?? null,
    actorEmail: row.actorEmail ?? null,
    actorServiceId: row.actorServiceId ?? null,
    organizationId: row.organizationId ?? null,
    tenantOrgId: row.tenantOrgId ?? row.organizationId ?? null,
    sourceAppKey: row.sourceAppKey,
    action: row.action,
    objectType: row.objectType ?? null,
    objectId: row.objectId ?? null,
    objectVersion: row.objectVersion ?? null,
    objectHash: row.objectHash ?? null,
    suiteObjectReferenceId: row.suiteObjectReferenceId ?? null,
    requestId: row.requestId ?? null,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    beforeJson: canonicalJsonValue(row.beforeJson),
    afterJson: canonicalJsonValue(row.afterJson),
    metadataJson: canonicalJsonValue(row.metadataJson),
    createdAt: toDate(row.createdAt).toISOString(),
  };
}

export function verifyAuditRow(row: AuditChainRow): boolean {
  const payload = auditRowToCanonicalPayload(row);
  const canonicalPayloadHash = sha256(stableStringify(payload));
  const currentHash = sha256(
    stableStringify({
      authorityVersion: AUDIT_AUTHORITY_VERSION,
      sequenceNumber: payload.sequenceNumber,
      previousHash: payload.previousHash,
      canonicalPayloadHash,
    }),
  );
  return row.canonicalPayloadHash === canonicalPayloadHash && row.currentHash === currentHash;
}

export function assertAuditChainContinuity(rows: AuditChainRow[]) {
  const sorted = [...rows].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  let previousHash: string | null = null;
  for (const row of sorted) {
    if (!verifyAuditRow(row)) {
      throw new Error(`Audit row ${row.sequenceNumber} failed canonical hash verification.`);
    }
    const expectedPrevious = previousHash ?? AUDIT_GENESIS_HASH;
    if (row.previousHash !== expectedPrevious) {
      throw new Error(`Audit row ${row.sequenceNumber} has a broken previousHash link.`);
    }
    previousHash = row.currentHash;
  }
}

export function buildAuditExportManifest(
  input: AuditExportManifestInput,
): AuditExportManifestOutput {
  const rows = [...input.rows].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  for (const row of rows) {
    if (!verifyAuditRow(row)) {
      throw new Error(`Audit row ${row.sequenceNumber} failed canonical hash verification.`);
    }
  }
  const createdAt = toDate(input.createdAt ?? new Date()).toISOString();
  const payload = {
    authorityVersion: AUDIT_AUTHORITY_VERSION,
    exportBatchId: input.exportBatchId,
    startDate: input.startDate ? toDate(input.startDate).toISOString() : null,
    endDate: input.endDate ? toDate(input.endDate).toISOString() : null,
    appFilters: [...(input.appFilters ?? [])].sort(),
    firstSequence: rows[0]?.sequenceNumber ?? null,
    lastSequence: rows[rows.length - 1]?.sequenceNumber ?? null,
    firstHash: rows[0]?.currentHash ?? null,
    lastHash: rows[rows.length - 1]?.currentHash ?? null,
    eventCount: rows.length,
    rowHashes: rows.map((row) => row.currentHash),
    signerIdentity: input.signerIdentity,
    createdAt,
  };
  const exportHash = sha256(stableStringify(payload));
  return {
    exportBatchId: payload.exportBatchId,
    startDate: payload.startDate,
    endDate: payload.endDate,
    appFilters: payload.appFilters,
    firstSequence: payload.firstSequence,
    lastSequence: payload.lastSequence,
    firstHash: payload.firstHash,
    lastHash: payload.lastHash,
    eventCount: payload.eventCount,
    exportHash,
    signerIdentity: payload.signerIdentity,
    signature: signAuditHash(exportHash, input.signingSecret ?? null) ?? exportHash,
    createdAt,
  };
}

export function assertAuditMutationForbidden(operation: "update" | "delete" | string): never {
  throw new Error(`AuditLog is append-only; ${operation} is forbidden.`);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

export function sha256(value: string): string {
  return createHash(AUDIT_HASH_ALGORITHM).update(value).digest("hex");
}

export function signAuditHash(hash: string, signingSecret?: string | null): string | null {
  if (!signingSecret) return null;
  return createHmac(AUDIT_HASH_ALGORITHM, signingSecret).update(hash).digest("hex");
}

export function redactAuditMetadata(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  return redact(value);
}

const SENSITIVE_KEY_RE = /(password|token|secret|api[_-]?key|authorization|cookie|ssn|dob)/i;

function redact(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? "[redacted]" : redact(child);
  }
  return out;
}

function canonicalJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] !== undefined) out[key] = canonicalJsonValue(source[key]);
  }
  return out;
}

function toDate(value: Date | string | null): Date {
  if (value instanceof Date) return value;
  if (!value) return new Date();
  return new Date(value);
}
