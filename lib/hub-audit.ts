import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ApiKeyScope, AuditCategory, AuditSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { verifyApiKey } from "@/lib/services/api-key-service";
import {
  AUDIT_GENESIS_HASH,
  assertAuditMutationForbidden,
  buildAuditChainEvent,
  buildAuditExportManifest,
  type AuditChainRow,
  type AuditExportManifestOutput,
  type CanonicalAuditEventInput,
} from "@/lib/hub-audit-core";

const MAX_APPEND_RETRIES = 3;
const DEFAULT_SIGNER_IDENTITY = "hub-audit";

export interface VerifiedAuditService {
  ok: true;
  keyId: string;
  keyName: string;
  sourceAppKey: string;
  serviceIdentityId: string;
}

export interface RejectedAuditService {
  ok: false;
  status: number;
  error: string;
  detail: string;
}

export interface HubAuditAppendInput extends CanonicalAuditEventInput {
  eventCategory?: AuditCategory | string | null;
  severity?: AuditSeverity | string | null;
}

export interface AuditExportFilters {
  startDate?: Date | null;
  endDate?: Date | null;
  appKeys?: string[] | null;
  signerIdentity?: string | null;
}

export async function verifyAuditServiceRequest(
  request: NextRequest,
  sourceAppKey: string | null | undefined,
): Promise<VerifiedAuditService | RejectedAuditService> {
  const token = extractAuditToken(request);
  if (!token) {
    return rejected(
      "missing_service_token",
      "Missing X-MacTech-Service-Token, X-MacTech-Audit-Key, or Authorization: Bearer token.",
    );
  }
  if (!sourceAppKey) {
    return rejected("missing_source_app", "sourceAppKey is required for Hub audit ingestion.");
  }

  const key = await verifyApiKey(token, "audit_ingest" as ApiKeyScope);
  if (!key) {
    return rejected(
      "invalid_service_token",
      "Service token is invalid, revoked, expired, or missing audit_ingest scope.",
    );
  }
  if (key.appKey !== sourceAppKey) {
    return rejected("service_app_mismatch", "Service token appKey must match sourceAppKey.");
  }

  const [sourceApp, serviceIdentity] = await Promise.all([
    prisma.appRegistry.findUnique({
      where: { appKey: sourceAppKey },
      select: { id: true, status: true, isInternalOnly: true },
    }),
    prisma.serviceIdentity.findUnique({
      where: { appKey: sourceAppKey },
      select: { id: true, status: true },
    }),
  ]);

  if (!sourceApp || sourceApp.status !== "active") {
    return rejected("invalid_source_app", "Calling app must be an active Hub AppRegistry row.");
  }
  if (!serviceIdentity || serviceIdentity.status !== "active") {
    return rejected("service_identity_inactive", "Calling app must have an active Hub ServiceIdentity row.");
  }

  await prisma.serviceIdentity
    .update({
      where: { id: serviceIdentity.id },
      data: { lastAuthenticatedAt: new Date() },
    })
    .catch(() => undefined);

  return {
    ok: true,
    keyId: key.id,
    keyName: key.name,
    sourceAppKey,
    serviceIdentityId: serviceIdentity.id,
  };
}

export async function appendHubAuditEvent(input: HubAuditAppendInput) {
  await validateCanonicalReferences(input);
  return appendAuditLogUnchecked(input);
}

export async function appendInternalHubAuditEvent(input: HubAuditAppendInput) {
  return appendAuditLogUnchecked({
    ...input,
    sourceAppKey: input.sourceAppKey || "hub",
  });
}

export async function createAuditExportManifest(
  filters: AuditExportFilters = {},
): Promise<AuditExportManifestOutput> {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) (where.createdAt as Prisma.DateTimeFilter).gte = filters.startDate;
    if (filters.endDate) (where.createdAt as Prisma.DateTimeFilter).lte = filters.endDate;
  }
  if (filters.appKeys?.length) where.sourceAppKey = { in: filters.appKeys };

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { sequenceNumber: "asc" },
    select: auditChainSelect,
  });
  const exportBatchId = `audit-export-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const manifest = buildAuditExportManifest({
    exportBatchId,
    startDate: filters.startDate ?? null,
    endDate: filters.endDate ?? null,
    appFilters: filters.appKeys ?? [],
    rows: rows.map(toAuditChainRow),
    signerIdentity: filters.signerIdentity ?? DEFAULT_SIGNER_IDENTITY,
    signingSecret: auditSigningSecret(),
    createdAt: new Date(),
  });

  await prisma.auditExportManifest.create({
    data: {
      exportBatchId: manifest.exportBatchId,
      startDate: filters.startDate ?? null,
      endDate: filters.endDate ?? null,
      appFiltersJson: manifest.appFilters,
      firstSequence: manifest.firstSequence,
      lastSequence: manifest.lastSequence,
      firstHash: manifest.firstHash,
      lastHash: manifest.lastHash,
      eventCount: manifest.eventCount,
      exportHash: manifest.exportHash,
      signerIdentity: manifest.signerIdentity,
      signature: manifest.signature,
      createdAt: new Date(manifest.createdAt),
    },
  });

  return manifest;
}

export function assertAuditLogUpdateForbidden(): never {
  return assertAuditMutationForbidden("update");
}

export function assertAuditLogDeleteForbidden(): never {
  return assertAuditMutationForbidden("delete");
}

async function appendAuditLogUnchecked(input: HubAuditAppendInput) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_APPEND_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.auditLog.findFirst({
          orderBy: { sequenceNumber: "desc" },
          select: { sequenceNumber: true, currentHash: true },
        });
        const sequenceNumber = (last?.sequenceNumber ?? 0) + 1;
        const previousHash =
          sequenceNumber === 1 ? AUDIT_GENESIS_HASH : last?.currentHash ?? null;
        const built = buildAuditChainEvent(input, {
          sequenceNumber,
          previousHash,
          signingSecret: auditSigningSecret(),
        });

        return tx.auditLog.create({
          data: {
            id: built.id,
            sequenceNumber: built.sequenceNumber,
            previousHash: built.previousHash,
            currentHash: built.currentHash,
            canonicalPayloadHash: built.canonicalPayloadHash,
            timestamp: built.createdAt,
            actorHubUserId: built.canonicalPayload.actorHubUserId,
            actorClerkUserId: built.canonicalPayload.actorClerkUserId,
            actorEmail: built.canonicalPayload.actorEmail,
            actorUserProfileId: built.canonicalPayload.actorHubUserId,
            actorServiceId: built.canonicalPayload.actorServiceId,
            organizationId: built.canonicalPayload.organizationId,
            customerOrganizationId: built.canonicalPayload.organizationId,
            tenantOrgId: built.canonicalPayload.tenantOrgId,
            appRegistryId: input.appRegistryId ?? (await appRegistryIdForKey(tx, input.sourceAppKey)),
            sourceAppKey: built.canonicalPayload.sourceAppKey,
            eventType: input.eventType ?? input.action,
            eventCategory: normalizeAuditCategory(input.eventCategory),
            severity: normalizeAuditSeverity(input.severity),
            action: input.action,
            objectType: built.canonicalPayload.objectType,
            objectId: built.canonicalPayload.objectId,
            objectVersion: built.canonicalPayload.objectVersion,
            objectHash: built.canonicalPayload.objectHash,
            resourceType: built.canonicalPayload.objectType,
            resourceId: built.canonicalPayload.objectId,
            suiteObjectReferenceId: built.canonicalPayload.suiteObjectReferenceId,
            requestId: built.canonicalPayload.requestId,
            ipAddress: built.canonicalPayload.ipAddress,
            userAgent: built.canonicalPayload.userAgent,
            beforeJson: toPrismaJson(built.canonicalPayload.beforeJson),
            afterJson: toPrismaJson(built.canonicalPayload.afterJson),
            metadataJson: toPrismaJson(built.canonicalPayload.metadataJson),
            signature: built.signature,
            createdAt: built.createdAt,
          },
        });
      });
    } catch (error) {
      lastError = error;
      if (!isUniqueSequenceRace(error)) break;
    }
  }
  throw lastError;
}

async function validateCanonicalReferences(input: HubAuditAppendInput) {
  const [sourceApp, actor, org, tenantOrg, objectRef] = await Promise.all([
    prisma.appRegistry.findUnique({
      where: { appKey: input.sourceAppKey },
      select: { id: true, status: true },
    }),
    input.actorHubUserId
      ? prisma.userProfile.findUnique({
          where: { id: input.actorHubUserId },
          select: { id: true, clerkUserId: true, status: true },
        })
      : Promise.resolve(null),
    input.organizationId
      ? prisma.customerOrganization.findUnique({
          where: { id: input.organizationId },
          select: { id: true, status: true },
        })
      : Promise.resolve(null),
    input.tenantOrgId
      ? prisma.customerOrganization.findUnique({
          where: { id: input.tenantOrgId },
          select: { id: true, status: true },
        })
      : Promise.resolve(null),
    input.suiteObjectReferenceId
      ? prisma.suiteObjectReference.findUnique({
          where: { id: input.suiteObjectReferenceId },
          select: { id: true, sourceAppKey: true },
        })
      : Promise.resolve(null),
  ]);

  if (!sourceApp || sourceApp.status !== "active") {
    throw new AuditIngestRejectedError("invalid_source_app", "sourceAppKey must resolve to an active AppRegistry row.", 403);
  }
  if (input.actorHubUserId && (!actor || actor.status !== "active")) {
    throw new AuditIngestRejectedError("invalid_actor", "actorHubUserId must resolve to an active Hub user.", 403);
  }
  if (actor && input.actorClerkUserId && actor.clerkUserId !== input.actorClerkUserId) {
    throw new AuditIngestRejectedError("actor_mismatch", "actorHubUserId and actorClerkUserId do not match.", 403);
  }
  if (input.organizationId && (!org || !["active", "onboarding"].includes(org.status))) {
    throw new AuditIngestRejectedError("invalid_organization", "organizationId must resolve to an active Hub organization.", 403);
  }
  if (input.tenantOrgId && !tenantOrg) {
    throw new AuditIngestRejectedError("invalid_tenant_org", "tenantOrgId must resolve to a Hub organization.", 403);
  }
  if (input.suiteObjectReferenceId && (!objectRef || objectRef.sourceAppKey !== input.sourceAppKey)) {
    throw new AuditIngestRejectedError("invalid_object_reference", "suiteObjectReferenceId must resolve for the source app.", 403);
  }
}

async function appRegistryIdForKey(tx: Prisma.TransactionClient, appKey: string) {
  const app = await tx.appRegistry.findUnique({
    where: { appKey },
    select: { id: true },
  });
  return app?.id ?? null;
}

function extractAuditToken(request: NextRequest): string | null {
  const serviceToken = request.headers.get("x-mactech-service-token");
  if (serviceToken) return serviceToken;
  const auditKey = request.headers.get("x-mactech-audit-key");
  if (auditKey) return auditKey;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function normalizeAuditCategory(value: unknown): AuditCategory {
  const category = typeof value === "string" ? value : "system";
  if (
    [
      "auth",
      "user",
      "org",
      "entitlement",
      "role",
      "security",
      "vault",
      "evidence",
      "boundary",
      "capture",
      "system",
    ].includes(category)
  ) {
    return category as AuditCategory;
  }
  return "system";
}

function normalizeAuditSeverity(value: unknown): AuditSeverity {
  return value === "warning" || value === "critical" ? value : "info";
}

function auditSigningSecret(): string | null {
  return (
    process.env.HUB_AUDIT_SIGNING_SECRET ??
    process.env.AUDIT_EXPORT_SIGNING_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    null
  );
}

function toPrismaJson(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

function isUniqueSequenceRace(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

type AuditChainSelectedRow = Prisma.AuditLogGetPayload<{ select: typeof auditChainSelect }>;

function toAuditChainRow(row: AuditChainSelectedRow): AuditChainRow {
  return {
    authorityVersion: "hub-audit-v1",
    id: row.id,
    sequenceNumber: row.sequenceNumber,
    previousHash: row.previousHash,
    currentHash: row.currentHash,
    canonicalPayloadHash: row.canonicalPayloadHash,
    actorHubUserId: row.actorHubUserId,
    actorClerkUserId: row.actorClerkUserId,
    actorEmail: row.actorEmail,
    actorServiceId: row.actorServiceId,
    organizationId: row.organizationId,
    tenantOrgId: row.tenantOrgId,
    sourceAppKey: row.sourceAppKey ?? "unknown",
    action: row.action,
    objectType: row.objectType,
    objectId: row.objectId,
    objectVersion: row.objectVersion,
    objectHash: row.objectHash,
    suiteObjectReferenceId: row.suiteObjectReferenceId,
    requestId: row.requestId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    metadataJson: row.metadataJson,
    createdAt: row.createdAt.toISOString(),
  };
}

const auditChainSelect = {
  id: true,
  sequenceNumber: true,
  previousHash: true,
  currentHash: true,
  canonicalPayloadHash: true,
  actorHubUserId: true,
  actorClerkUserId: true,
  actorEmail: true,
  actorServiceId: true,
  organizationId: true,
  tenantOrgId: true,
  sourceAppKey: true,
  action: true,
  objectType: true,
  objectId: true,
  objectVersion: true,
  objectHash: true,
  suiteObjectReferenceId: true,
  requestId: true,
  ipAddress: true,
  userAgent: true,
  beforeJson: true,
  afterJson: true,
  metadataJson: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

function rejected(error: string, detail: string): RejectedAuditService {
  return { ok: false, status: 401, error, detail };
}

export class AuditIngestRejectedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AuditIngestRejectedError";
  }
}

export function auditErrorResponse(error: unknown) {
  if (error instanceof AuditIngestRejectedError) {
    return NextResponse.json(
      { error: error.code, detail: error.message },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "audit_ingest_failed", detail: "Hub failed closed while appending audit event." },
    { status: 500 },
  );
}
