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

export type ContractAccessEntry = {
  contractId: string;
  role: "OWNER" | "CONTRIBUTOR" | "VIEWER";
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
  contractAccess?: ContractAccessEntry[] | null;
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
  appKey?: string;
  sourceAppKey?: string;
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
  actorHubUserId?: string | null;
  actorClerkUserId?: string | null;
  actorEmail?: string | null;
  actorServiceId?: string | null;
  organizationId?: string | null;
  tenantOrgId?: string | null;
  customerOrgId?: string | null;
  customerOrgClerkId?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  objectVersion?: string | null;
  objectHash?: string | null;
  suiteObjectReferenceId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  requestId?: string | null;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export type HubAuditEventResult = {
  ok: true;
  id: string;
  sequenceNumber: number;
  currentHash: string;
};

export type SuiteObjectReferenceInput = {
  sourceAppKey?: string | null;
  owningAppKey: string;
  objectType: string;
  objectId: string;
  objectVersion?: string | null;
  objectHash?: string | null;
  tenantOrgId?: string | null;
  organizationId?: string | null;
  createdByHubUserId?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

export type SuiteObjectReference = SuiteObjectReferenceInput & {
  id: string;
  createdByServiceId?: string | null;
  createdAt: string;
  lastVerifiedAt?: string | null;
  verificationStatus: "pending" | "verified" | "failed" | "deprecated";
  deprecatedAt?: string | null;
  replacedByReferenceId?: string | null;
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
