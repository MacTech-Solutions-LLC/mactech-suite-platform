import { createHash } from "crypto";

export const HUB_AUTHORITY_CONTRACT_VERSION = "hub-authority-contract-v1";
export const DEFAULT_AUTHORITY_TTL_SECONDS = 60;

export type HubAuthorityDecisionOutcome = "allow" | "deny";

export type HubAuthorityDenyReason =
  | "service_identity_invalid"
  | "source_app_unknown"
  | "app_registry_missing"
  | "app_inactive"
  | "internal_app_forbidden"
  | "user_missing"
  | "user_inactive"
  | "org_context_required"
  | "organization_missing"
  | "organization_inactive"
  | "membership_missing"
  | "membership_inactive"
  | "entitlement_missing"
  | "entitlement_inactive"
  | "entitlement_expired"
  | "role_resolution_failed";

export interface HubAuthorityRequest {
  clerkUserId: string;
  appKey: string;
  requestedOrgId?: string | null;
  tenantOrgId?: string | null;
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  service?: {
    sourceAppKey: string;
    serviceIdentityId?: string | null;
    keyId?: string | null;
    authMethod?: "service_token" | "signed_request";
  } | null;
}

export interface ContractAccessEntry {
  contractId: string;
  role: "OWNER" | "CONTRIBUTOR" | "VIEWER";
}

export interface HubAuthoritySnapshot {
  canonicalHubUserId: string | null;
  clerkUserId: string;
  userStatus: string | null;
  canonicalOrganizationId: string | null;
  organizationStatus: string | null;
  membershipId: string | null;
  membershipStatus: string | null;
  memberRoles: string[];
  resolvedPermissions: string[];
  contractAccess: ContractAccessEntry[];
  appKey: string;
  appRegistryStatus: string | null;
  productEntitlementStatus: string | null;
  entitlementStartsAt: string | null;
  entitlementExpiresAt: string | null;
  planTier: string | null;
  cache: {
    issuedAt: string;
    expiresAt: string;
    ttlSeconds: number;
    authorityVersion: number;
    authorityHash: string;
  };
  decision: {
    allow: boolean;
    outcome: HubAuthorityDecisionOutcome;
    denyReason: HubAuthorityDenyReason | null;
    requiredRemediation: string | null;
  };
  sessionContext?: {
    isInternalMacTechUser: boolean;
    boundClerkOrgId: string | null;
    activeOrganizationCount: number;
  };
}

export interface AuthorityRecordBase {
  authorityVersion?: number | null;
  updatedAt?: Date | string | null;
}

export interface CanonicalUserRecord extends AuthorityRecordBase {
  id: string;
  clerkUserId: string;
  status: string;
  isInternalMacTechUser: boolean;
  platformRole?: string | null;
}

export interface CanonicalOrganizationRecord extends AuthorityRecordBase {
  id: string;
  status: string;
}

export interface CanonicalMembershipRecord extends AuthorityRecordBase {
  id: string;
  status: string;
  role: string;
  permissionsJson?: unknown;
}

export interface CanonicalAppRecord extends AuthorityRecordBase {
  id: string;
  appKey: string;
  status: string;
  requiresOrgContext: boolean;
  isInternalOnly: boolean;
}

export interface CanonicalEntitlementRecord extends AuthorityRecordBase {
  id: string;
  enabled: boolean;
  status: string;
  plan: string;
  startsAt?: Date | string | null;
  expiresAt?: Date | string | null;
}

export interface AuthorityEvaluationRecords {
  serviceValid: boolean;
  sourceAppKnown: boolean;
  app: CanonicalAppRecord | null;
  user: CanonicalUserRecord | null;
  organization: CanonicalOrganizationRecord | null;
  membership: CanonicalMembershipRecord | null;
  entitlement: CanonicalEntitlementRecord | null;
  roleTemplatePermissions?: string[] | null;
  contractMemberships?: ContractAccessEntry[] | null;
}

export function evaluateHubAuthorityRecords(
  input: HubAuthorityRequest,
  records: AuthorityEvaluationRecords,
  options: { now?: Date; ttlSeconds?: number } = {},
): HubAuthoritySnapshot {
  const now = options.now ?? new Date();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_AUTHORITY_TTL_SECONDS;

  if (!records.serviceValid) {
    return deny(input, records, "service_identity_invalid", "Rotate or provide an active Hub service token.", now, ttlSeconds);
  }
  if (!records.sourceAppKnown) {
    return deny(input, records, "source_app_unknown", "Register the calling app in Hub service identities and AppRegistry.", now, ttlSeconds);
  }
  if (!records.app) {
    return deny(input, records, "app_registry_missing", "Seed or register the requested app in Hub AppRegistry.", now, ttlSeconds);
  }
  if (records.app.status !== "active") {
    return deny(input, records, "app_inactive", "Reactivate the requested app registry row before granting access.", now, ttlSeconds);
  }
  if (!records.user) {
    return deny(input, records, "user_missing", "Sync the Clerk user into Hub UserProfile.", now, ttlSeconds);
  }
  if (records.user.status !== "active") {
    return deny(input, records, "user_inactive", "Reactivate the Hub user before granting Suite access.", now, ttlSeconds);
  }
  if (records.app.isInternalOnly && !isInternalUser(records.user)) {
    return deny(input, records, "internal_app_forbidden", "Internal-only apps require an active MacTech platform user.", now, ttlSeconds);
  }

  if (records.app.requiresOrgContext) {
    if (!input.requestedOrgId && !input.tenantOrgId) {
      return deny(input, records, "org_context_required", "Pass a canonical Hub org id, Clerk org id, or tenant org id.", now, ttlSeconds);
    }
    if (!records.organization) {
      return deny(input, records, "organization_missing", "Sync or select an active Hub customer organization.", now, ttlSeconds);
    }
    if (records.organization.status !== "active") {
      return deny(input, records, "organization_inactive", "Reactivate or resolve billing/status for the organization.", now, ttlSeconds);
    }
    if (!records.membership) {
      return deny(input, records, "membership_missing", "Grant an active Hub OrgUserAccess membership.", now, ttlSeconds);
    }
    if (records.membership.status !== "active") {
      return deny(input, records, "membership_inactive", "Reactivate the Hub membership before granting access.", now, ttlSeconds);
    }
    if (!records.entitlement) {
      return deny(input, records, "entitlement_missing", "Enable a ProductEntitlement for this app and organization.", now, ttlSeconds);
    }
    if (!entitlementIsCurrentlyUsable(records.entitlement, now)) {
      const reason =
        records.entitlement.expiresAt && toDate(records.entitlement.expiresAt)! <= now
          ? "entitlement_expired"
          : "entitlement_inactive";
      return deny(input, records, reason, "Enable, unsuspend, or renew the app entitlement.", now, ttlSeconds);
    }
    if (resolvePermissions(records).length === 0 && !isInternalUser(records.user)) {
      return deny(input, records, "role_resolution_failed", "Attach permissionsJson or a matching Hub RoleTemplate.", now, ttlSeconds);
    }
  }

  return buildSnapshot(input, records, true, null, null, now, ttlSeconds);
}

export function hashAuthoritySnapshot(snapshot: HubAuthoritySnapshot): string {
  const hashInput = {
    ...snapshot,
    cache: { ...snapshot.cache, authorityHash: "" },
  };
  return createHash("sha256").update(stableJson(hashInput)).digest("hex");
}

function deny(
  input: HubAuthorityRequest,
  records: AuthorityEvaluationRecords,
  reason: HubAuthorityDenyReason,
  remediation: string,
  now: Date,
  ttlSeconds: number,
) {
  return buildSnapshot(input, records, false, reason, remediation, now, ttlSeconds);
}

function buildSnapshot(
  input: HubAuthorityRequest,
  records: AuthorityEvaluationRecords,
  allow: boolean,
  denyReason: HubAuthorityDenyReason | null,
  requiredRemediation: string | null,
  now: Date,
  ttlSeconds: number,
): HubAuthoritySnapshot {
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const permissions = allow ? resolvePermissions(records) : [];
  const snapshot: HubAuthoritySnapshot = {
    canonicalHubUserId: records.user?.id ?? null,
    clerkUserId: input.clerkUserId,
    userStatus: records.user?.status ?? null,
    canonicalOrganizationId: records.organization?.id ?? null,
    organizationStatus: records.organization?.status ?? null,
    membershipId: records.membership?.id ?? null,
    membershipStatus: records.membership?.status ?? null,
    memberRoles: records.membership?.role ? [records.membership.role] : [],
    resolvedPermissions: permissions,
    contractAccess: allow ? (records.contractMemberships ?? []) : [],
    appKey: input.appKey,
    appRegistryStatus: records.app?.status ?? null,
    productEntitlementStatus: records.entitlement?.status ?? null,
    entitlementStartsAt: records.entitlement?.startsAt ? toDate(records.entitlement.startsAt)!.toISOString() : null,
    entitlementExpiresAt: records.entitlement?.expiresAt ? toDate(records.entitlement.expiresAt)!.toISOString() : null,
    planTier: records.entitlement?.plan ?? null,
    cache: {
      issuedAt,
      expiresAt,
      ttlSeconds,
      authorityVersion: computeAuthorityVersion(records),
      authorityHash: "",
    },
    decision: {
      allow,
      outcome: allow ? "allow" : "deny",
      denyReason,
      requiredRemediation,
    },
  };
  snapshot.cache.authorityHash = hashAuthoritySnapshot(snapshot);
  return snapshot;
}

function isInternalUser(user: CanonicalUserRecord): boolean {
  return user.isInternalMacTechUser && user.status === "active" && user.platformRole !== "none";
}

function entitlementIsCurrentlyUsable(entitlement: CanonicalEntitlementRecord, now: Date): boolean {
  if (!entitlement.enabled) return false;
  if (!["active", "trialing"].includes(entitlement.status)) return false;
  const startsAt = entitlement.startsAt ? toDate(entitlement.startsAt) : null;
  const expiresAt = entitlement.expiresAt ? toDate(entitlement.expiresAt) : null;
  if (startsAt && startsAt > now) return false;
  if (expiresAt && expiresAt <= now) return false;
  return true;
}

function resolvePermissions(records: AuthorityEvaluationRecords): string[] {
  const raw = records.membership?.permissionsJson;
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === "string");
  return records.roleTemplatePermissions ?? [];
}

function computeAuthorityVersion(records: AuthorityEvaluationRecords): number {
  const versions = [
    records.app,
    records.user,
    records.organization,
    records.membership,
    records.entitlement,
  ].flatMap((record) => {
    if (!record) return [];
    const fromVersion = record.authorityVersion ?? 1;
    const fromUpdatedAt = record.updatedAt ? toDate(record.updatedAt)?.getTime() ?? 0 : 0;
    return [fromVersion, fromUpdatedAt];
  });
  return Math.max(1, ...versions);
}

function toDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}
