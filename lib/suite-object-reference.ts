import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ApiKeyScope, Prisma, SuiteObjectReferenceVerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { verifyApiKey } from "@/lib/services/api-key-service";
import { appendInternalHubAuditEvent } from "@/lib/hub-audit";
import {
  assertReferenceActive,
  validateSuiteObjectReferenceShape,
  SuiteObjectReferenceValidationError,
} from "@/lib/suite-object-reference-core";

export interface VerifiedObjectReferenceService {
  ok: true;
  keyId: string;
  keyName: string;
  sourceAppKey: string;
  serviceIdentityId: string;
}

export interface RejectedObjectReferenceService {
  ok: false;
  status: number;
  error: string;
  detail: string;
}

export interface CreateSuiteObjectReferenceInput {
  sourceAppKey?: string | null;
  owningAppKey: string;
  objectType: string;
  objectId: string;
  objectVersion?: string | null;
  objectHash?: string | null;
  tenantOrgId?: string | null;
  organizationId?: string | null;
  createdByHubUserId?: string | null;
  metadataJson?: Prisma.InputJsonValue | null;
}

export interface VerifySuiteObjectReferenceInput {
  id: string;
  verificationStatus?: SuiteObjectReferenceVerificationStatus | null;
  objectHash?: string | null;
  metadataJson?: Prisma.InputJsonValue | null;
}

export interface DeprecateSuiteObjectReferenceInput {
  id: string;
  replacedByReferenceId: string;
  metadataJson?: Prisma.InputJsonValue | null;
}

export async function verifyObjectReferenceServiceRequest(
  request: NextRequest,
  sourceAppKey: string | null | undefined,
): Promise<VerifiedObjectReferenceService | RejectedObjectReferenceService> {
  const token = extractServiceToken(request);
  if (!token) {
    return rejected(
      "missing_service_token",
      "Missing X-MacTech-Service-Token or Authorization: Bearer token.",
    );
  }
  if (!sourceAppKey) {
    return rejected("missing_source_app", "sourceAppKey is required for object reference calls.");
  }

  const key = await verifyApiKey(token, "object_reference_write" as ApiKeyScope);
  if (!key) {
    return rejected(
      "invalid_service_token",
      "Service token is invalid, revoked, expired, or missing object_reference_write scope.",
    );
  }
  if (key.appKey !== sourceAppKey) {
    return rejected("service_app_mismatch", "Service token appKey must match sourceAppKey.");
  }

  const [sourceApp, serviceIdentity] = await Promise.all([
    prisma.appRegistry.findUnique({
      where: { appKey: sourceAppKey },
      select: { id: true, status: true },
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

export async function createSuiteObjectReference(
  input: CreateSuiteObjectReferenceInput,
  service: VerifiedObjectReferenceService,
) {
  const sourceAppKey = input.sourceAppKey ?? service.sourceAppKey;
  validateSuiteObjectReferenceShape({ ...input, sourceAppKey });
  await validateHubReferences({
    sourceAppKey,
    owningAppKey: input.owningAppKey,
    tenantOrgId: input.tenantOrgId ?? null,
    organizationId: input.organizationId ?? null,
    createdByHubUserId: input.createdByHubUserId ?? null,
  });

  const existing = await prisma.suiteObjectReference.findFirst({
    where: {
      owningAppKey: input.owningAppKey,
      objectType: input.objectType,
      objectId: input.objectId,
      objectVersion: input.objectVersion ?? null,
    },
  });
  const data = {
    sourceAppKey,
    objectHash: input.objectHash ?? null,
    tenantOrgId: input.tenantOrgId ?? input.organizationId ?? null,
    organizationId: input.organizationId ?? input.tenantOrgId ?? null,
    createdByHubUserId: input.createdByHubUserId ?? null,
    createdByServiceId: service.serviceIdentityId,
    metadataJson: input.metadataJson ?? undefined,
  };
  const row = existing
    ? await prisma.suiteObjectReference.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.suiteObjectReference.create({
        data: {
          ...data,
          owningAppKey: input.owningAppKey,
          objectType: input.objectType,
          objectId: input.objectId,
          objectVersion: input.objectVersion ?? null,
        },
      });

  await emitReferenceAudit("suite_object_reference.created", row.id, service, {
    owningAppKey: row.owningAppKey,
    objectType: row.objectType,
    objectId: row.objectId,
  });
  return row;
}

export async function getSuiteObjectReference(id: string) {
  const row = await prisma.suiteObjectReference.findUnique({
    where: { id },
    include: {
      replacedByReference: true,
    },
  });
  if (!row) throw new SuiteObjectReferenceNotFoundError(id);
  return row;
}

export async function verifySuiteObjectReference(
  input: VerifySuiteObjectReferenceInput,
  service: VerifiedObjectReferenceService,
) {
  const existing = await getSuiteObjectReference(input.id);
  assertReferenceServiceAccess(existing, service);
  assertReferenceActive(existing);
  if (input.objectHash && existing.objectHash && input.objectHash !== existing.objectHash) {
    throw new SuiteObjectReferenceRejectedError(
      "object_hash_mismatch",
      "Verification objectHash does not match the stored reference hash.",
      409,
    );
  }

  const row = await prisma.suiteObjectReference.update({
    where: { id: input.id },
    data: {
      verificationStatus: input.verificationStatus ?? "verified",
      lastVerifiedAt: new Date(),
      metadataJson: mergeMetadata(existing.metadataJson, input.metadataJson),
    },
  });

  await emitReferenceAudit("suite_object_reference.verified", row.id, service, {
    verificationStatus: row.verificationStatus,
  });
  return row;
}

export async function deprecateSuiteObjectReference(
  input: DeprecateSuiteObjectReferenceInput,
  service: VerifiedObjectReferenceService,
) {
  if (!input.replacedByReferenceId) {
    throw new SuiteObjectReferenceRejectedError(
      "replacement_required",
      "replacedByReferenceId is required when deprecating a reference.",
      400,
    );
  }
  const [existing, replacement] = await Promise.all([
    getSuiteObjectReference(input.id),
    getSuiteObjectReference(input.replacedByReferenceId),
  ]);
  assertReferenceServiceAccess(existing, service);
  assertReferenceActive(replacement);
  if (existing.id === replacement.id) {
    throw new SuiteObjectReferenceRejectedError("self_replacement", "A reference cannot replace itself.", 400);
  }

  const row = await prisma.suiteObjectReference.update({
    where: { id: existing.id },
    data: {
      deprecatedAt: new Date(),
      replacedByReferenceId: replacement.id,
      verificationStatus: "deprecated",
      metadataJson: mergeMetadata(existing.metadataJson, input.metadataJson),
    },
  });

  await emitReferenceAudit("suite_object_reference.deprecated", row.id, service, {
    replacedByReferenceId: replacement.id,
  });
  return row;
}

export function assertSuiteObjectReferenceCanBeUsed(reference: {
  id: string;
  deprecatedAt?: Date | string | null;
  verificationStatus?: string | null;
}) {
  return assertReferenceActive(reference);
}

export function assertSuiteObjectReferenceServiceAccess(
  reference: { sourceAppKey: string; owningAppKey: string },
  service: VerifiedObjectReferenceService,
) {
  return assertReferenceServiceAccess(reference, service);
}

async function validateHubReferences(input: {
  sourceAppKey: string;
  owningAppKey: string;
  tenantOrgId?: string | null;
  organizationId?: string | null;
  createdByHubUserId?: string | null;
}) {
  const [sourceApp, owningApp, tenantOrg, org, user] = await Promise.all([
    prisma.appRegistry.findUnique({ where: { appKey: input.sourceAppKey }, select: { appKey: true, status: true } }),
    prisma.appRegistry.findUnique({ where: { appKey: input.owningAppKey }, select: { appKey: true, status: true } }),
    input.tenantOrgId
      ? prisma.customerOrganization.findUnique({ where: { id: input.tenantOrgId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    input.organizationId
      ? prisma.customerOrganization.findUnique({ where: { id: input.organizationId }, select: { id: true, status: true } })
      : Promise.resolve(null),
    input.createdByHubUserId
      ? prisma.userProfile.findUnique({ where: { id: input.createdByHubUserId }, select: { id: true, status: true } })
      : Promise.resolve(null),
  ]);

  if (!sourceApp || sourceApp.status !== "active") {
    throw new SuiteObjectReferenceRejectedError("invalid_source_app", "sourceAppKey must exist in active AppRegistry.", 403);
  }
  if (!owningApp || owningApp.status !== "active") {
    throw new SuiteObjectReferenceRejectedError("invalid_owning_app", "owningAppKey must exist in active AppRegistry.", 403);
  }
  if (input.tenantOrgId && !tenantOrg) {
    throw new SuiteObjectReferenceRejectedError("invalid_tenant_org", "tenantOrgId must be a Hub canonical organization ID.", 403);
  }
  if (tenantOrg && !["active", "onboarding"].includes(tenantOrg.status)) {
    throw new SuiteObjectReferenceRejectedError("invalid_tenant_org", "tenantOrgId must resolve to an active Hub organization.", 403);
  }
  if (input.organizationId && !org) {
    throw new SuiteObjectReferenceRejectedError("invalid_organization", "organizationId must be a Hub canonical organization ID.", 403);
  }
  if (org && !["active", "onboarding"].includes(org.status)) {
    throw new SuiteObjectReferenceRejectedError("invalid_organization", "organizationId must resolve to an active Hub organization.", 403);
  }
  if (input.createdByHubUserId && (!user || user.status !== "active")) {
    throw new SuiteObjectReferenceRejectedError("invalid_actor", "createdByHubUserId must resolve to an active Hub user.", 403);
  }
}

function assertReferenceServiceAccess(
  reference: { sourceAppKey: string; owningAppKey: string },
  service: VerifiedObjectReferenceService,
) {
  if (service.sourceAppKey !== reference.sourceAppKey && service.sourceAppKey !== reference.owningAppKey) {
    throw new SuiteObjectReferenceRejectedError(
      "reference_app_mismatch",
      "Service identity may only operate on references it sourced or owns.",
      403,
    );
  }
}

async function emitReferenceAudit(
  action: string,
  referenceId: string,
  service: VerifiedObjectReferenceService,
  metadata: Record<string, unknown>,
) {
  await appendInternalHubAuditEvent({
    sourceAppKey: service.sourceAppKey,
    eventType: action,
    eventCategory: "system",
    severity: "info",
    action,
    actorServiceId: service.serviceIdentityId,
    objectType: "SuiteObjectReference",
    objectId: referenceId,
    suiteObjectReferenceId: referenceId,
    metadataJson: {
      ...metadata,
      keyId: service.keyId,
    },
  });
}

function extractServiceToken(request: NextRequest): string | null {
  const explicit = request.headers.get("x-mactech-service-token");
  if (explicit) return explicit;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function mergeMetadata(
  previous: unknown,
  next: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!next) return previous as Prisma.InputJsonValue | undefined;
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) return next;
  if (typeof next !== "object" || Array.isArray(next)) return next;
  return { ...(previous as Record<string, unknown>), ...(next as Record<string, unknown>) } as Prisma.InputJsonValue;
}

function rejected(error: string, detail: string): RejectedObjectReferenceService {
  return { ok: false, status: 401, error, detail };
}

export function suiteObjectReferenceErrorResponse(error: unknown) {
  if (error instanceof SuiteObjectReferenceValidationError) {
    return NextResponse.json({ error: "validation_failed", detail: error.message }, { status: 400 });
  }
  if (error instanceof SuiteObjectReferenceRejectedError) {
    return NextResponse.json({ error: error.code, detail: error.message }, { status: error.status });
  }
  if (error instanceof SuiteObjectReferenceNotFoundError) {
    return NextResponse.json({ error: "reference_not_found", detail: error.message }, { status: 404 });
  }
  return NextResponse.json({ error: "object_reference_failed" }, { status: 500 });
}

export class SuiteObjectReferenceRejectedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SuiteObjectReferenceRejectedError";
  }
}

export class SuiteObjectReferenceNotFoundError extends Error {
  constructor(id: string) {
    super(`SuiteObjectReference not found: ${id}`);
    this.name = "SuiteObjectReferenceNotFoundError";
  }
}
