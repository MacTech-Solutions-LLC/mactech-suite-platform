export type HubAuthorityDecision = {
  allow: boolean;
  outcome: "allow" | "deny";
  denyReason: string | null;
  requiredRemediation: string | null;
};

export type HubAuthorityRequest = {
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
};

export type HubAuthoritySnapshot = {
  canonicalHubUserId: string | null;
  clerkUserId: string;
  userStatus: string | null;
  canonicalOrganizationId: string | null;
  organizationStatus: string | null;
  membershipId: string | null;
  membershipStatus: string | null;
  memberRoles: string[];
  resolvedPermissions: string[];
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
  decision: HubAuthorityDecision;
};

export type HubAuditEventInput = {
  appKey: string;
  eventType: string;
  eventCategory:
    | "auth"
    | "user"
    | "org"
    | "entitlement"
    | "role"
    | "security"
    | "vault"
    | "evidence"
    | "boundary"
    | "capture"
    | "system";
  severity?: "info" | "warning" | "critical";
  action: string;
  actorClerkUserId?: string | null;
  actorEmail?: string | null;
  customerOrgId?: string | null;
  customerOrgClerkId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SuiteObjectReferenceInput = {
  objectType: string;
  objectId?: string | null;
  externalId?: string | null;
  sourceAppKey?: string | null;
  customerOrganizationId?: string | null;
};

export type HubClientConfig = {
  hubBaseUrl: string;
  sourceAppKey: string;
  serviceToken?: string;
  requestId?: string;
  defaultTtlSeconds?: number;
  allowStaleCacheForReadOnly?: boolean;
  fetchImpl?: typeof fetch;
  unsafeDevOverride?: {
    enabled: boolean;
    envVarName?: string;
    snapshot?: HubAuthoritySnapshot;
  };
};

export type RequireHubAccessOptions = {
  allowStaleCacheForReadOnly?: boolean;
  privileged?: boolean;
};
