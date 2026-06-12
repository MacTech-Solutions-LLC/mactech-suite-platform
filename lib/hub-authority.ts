import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog, writeSecurityEvent } from "@/lib/audit";
import {
  canonicalAppKeysMatch,
  resolveCanonicalAppKey,
} from "@/lib/app-key-compat";
import {
  DEFAULT_AUTHORITY_TTL_SECONDS,
  evaluateHubAuthorityRecords,
  type AuthorityEvaluationRecords,
  type HubAuthorityRequest,
  type HubAuthoritySnapshot,
} from "@/lib/hub-authority-core";

export interface VerifiedHubService {
  ok: true;
  keyId: string;
  keyName: string;
  sourceAppKey: string;
  serviceIdentityId: string;
}

export interface RejectedHubService {
  ok: false;
  status: number;
  error: string;
  detail: string;
}

export async function verifyHubServiceRequest(
  request: NextRequest,
  sourceAppKey: string | null | undefined,
): Promise<VerifiedHubService | RejectedHubService> {
  const token = extractServiceToken(request);
  if (!token) {
    return rejected("missing_service_token", "Missing X-MacTech-Service-Token or Authorization: Bearer token.");
  }
  if (!sourceAppKey) {
    return rejected("missing_source_app", "service.sourceAppKey is required for Hub authority calls.");
  }

  const canonicalSourceAppKey = resolveCanonicalAppKey(sourceAppKey);

  const [apiKey, sourceApp, serviceIdentity] = await Promise.all([
    findApiKey(token),
    prisma.appRegistry.findUnique({ where: { appKey: canonicalSourceAppKey } }),
    prisma.serviceIdentity.findUnique({ where: { appKey: canonicalSourceAppKey } }),
  ]);

  if (!apiKey) {
    return rejected("invalid_service_token", "Service token is invalid, revoked, expired, or missing app_authority_resolve scope.");
  }
  if (apiKey.appKey && !canonicalAppKeysMatch(apiKey.appKey, sourceAppKey)) {
    return rejected("service_app_mismatch", "Service token appKey must match service.sourceAppKey.");
  }
  if (!sourceApp || sourceApp.status !== "active") {
    return rejected("source_app_unknown", "Calling app must be an active Hub AppRegistry row.");
  }
  if (!serviceIdentity || serviceIdentity.status !== "active") {
    return rejected("service_identity_inactive", "Calling app must have an active Hub ServiceIdentity row.");
  }

  await Promise.allSettled([
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }),
    prisma.serviceIdentity.update({
      where: { id: serviceIdentity.id },
      data: { lastAuthenticatedAt: new Date() },
    }),
  ]);

  return {
    ok: true,
    keyId: apiKey.id,
    keyName: apiKey.name,
    sourceAppKey: canonicalSourceAppKey,
    serviceIdentityId: serviceIdentity.id,
  };
}

export async function resolveHubAppAccess(
  input: HubAuthorityRequest,
  service: VerifiedHubService,
): Promise<HubAuthoritySnapshot> {
  const now = new Date();
  const orgLookup = input.requestedOrgId ?? input.tenantOrgId ?? null;

  const canonicalAppKey = resolveCanonicalAppKey(input.appKey);
  const authorityInput = { ...input, appKey: canonicalAppKey };

  const [app, user, org] = await Promise.all([
    prisma.appRegistry.findUnique({ where: { appKey: canonicalAppKey } }),
    prisma.userProfile.findUnique({ where: { clerkUserId: input.clerkUserId } }),
    orgLookup ? findOrganization(orgLookup) : Promise.resolve(null),
  ]);

  const [membershipEntitlementPair, contractMemberships] = await Promise.all([
    app?.requiresOrgContext && user && org
      ? Promise.all([
          prisma.orgUserAccess.findUnique({
            where: {
              customerOrganizationId_userProfileId: {
                customerOrganizationId: org.id,
                userProfileId: user.id,
              },
            },
          }),
          prisma.productEntitlement.findUnique({
            where: {
              customerOrganizationId_appRegistryId: {
                customerOrganizationId: org.id,
                appRegistryId: app.id,
              },
            },
          }),
        ])
      : Promise.resolve([null, null] as [null, null]),
    user
      ? prisma.contractMembership.findMany({
          where: {
            userProfileId: user.id,
            contract: { stage: { not: "CLOSEOUT" } },
          },
          select: { contractId: true, role: true },
        })
      : Promise.resolve([]),
  ]);

  const [membership, entitlement] = membershipEntitlementPair;

  const resolvedRoleTemplate =
    membership && !Array.isArray(membership.permissionsJson)
      ? await prisma.roleTemplate.findUnique({
          where: { scope_key: { scope: "customer_org", key: membership.role } },
        })
      : null;

  const records: AuthorityEvaluationRecords = {
    serviceValid: true,
    sourceAppKnown: true,
    app,
    user,
    organization: org,
    membership,
    entitlement,
    roleTemplatePermissions: parsePermissionArray(resolvedRoleTemplate?.permissionsJson),
    contractMemberships: contractMemberships.map((m) => ({ contractId: m.contractId, role: m.role })),
  };

  const snapshot = evaluateHubAuthorityRecords(authorityInput, records, {
    now,
    ttlSeconds: DEFAULT_AUTHORITY_TTL_SECONDS,
  });

  await auditAuthorityResolution(authorityInput, snapshot, service);
  return snapshot;
}

async function findOrganization(orgLookup: string) {
  return prisma.customerOrganization.findFirst({
    where: {
      OR: [{ id: orgLookup }, { clerkOrgId: orgLookup }, { slug: orgLookup }],
    },
  });
}

async function auditAuthorityResolution(
  input: HubAuthorityRequest,
  snapshot: HubAuthoritySnapshot,
  service: VerifiedHubService,
) {
  const app = snapshot.appKey
    ? await prisma.appRegistry.findUnique({ where: { appKey: snapshot.appKey } })
    : null;
  await writeAuditLog({
    eventType: "hub.authority.resolve_app_access",
    eventCategory: "auth",
    severity: snapshot.decision.allow ? "info" : "warning",
    action: `${snapshot.decision.outcome} app access for ${snapshot.appKey}`,
    actorClerkUserId: input.clerkUserId,
    actorUserProfileId: snapshot.canonicalHubUserId,
    customerOrganizationId: snapshot.canonicalOrganizationId,
    appRegistryId: app?.id ?? null,
    resourceType: "HubAuthoritySnapshot",
    resourceId: snapshot.cache.authorityHash,
    ipAddress: input.sourceIp ?? null,
    userAgent: input.userAgent ?? null,
    requestId: input.requestId ?? null,
    metadata: {
      sourceAppKey: service.sourceAppKey,
      serviceIdentityId: service.serviceIdentityId,
      keyId: service.keyId,
      decision: snapshot.decision,
      authorityVersion: snapshot.cache.authorityVersion,
    },
  });

  if (!snapshot.decision.allow) {
    await writeSecurityEvent({
      eventType: "hub.authority.denied",
      severity: "medium",
      description: `Hub authority denied ${snapshot.appKey}: ${snapshot.decision.denyReason}`,
      customerOrganizationId: snapshot.canonicalOrganizationId,
      actorClerkUserId: input.clerkUserId,
      sourceAppKey: service.sourceAppKey,
      ipAddress: input.sourceIp ?? null,
      userAgent: input.userAgent ?? null,
      metadata: {
        requestId: input.requestId,
        denyReason: snapshot.decision.denyReason,
        requiredRemediation: snapshot.decision.requiredRemediation,
      },
    });
  }
}

function extractServiceToken(request: NextRequest): string | null {
  const explicit = request.headers.get("x-mactech-service-token");
  if (explicit) return explicit;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

async function findApiKey(plaintext: string) {
  const keyHash = createHash("sha256").update(plaintext).digest("hex");
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      name: true,
      keyHash: true,
      scopes: true,
      status: true,
      expiresAt: true,
      appKey: true,
    },
  });
  if (!apiKey) return null;
  if (!safeEquals(apiKey.keyHash, keyHash)) return null;
  if (apiKey.status !== "active") return null;
  if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) return null;
  if (!apiKey.scopes.includes("app_authority_resolve")) return null;
  return apiKey;
}

function parsePermissionArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((permission): permission is string => typeof permission === "string");
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function rejected(error: string, detail: string): RejectedHubService {
  return { ok: false, status: 401, error, detail };
}
