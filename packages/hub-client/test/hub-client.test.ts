import assert from "node:assert/strict";
import test from "node:test";
import {
  HubAccessDeniedError,
  HubContractValidationError,
  HubUnavailableError,
  createHubServiceClient,
  hashAuthoritySnapshot,
  verifyAuthoritySnapshot,
  type HubAuthoritySnapshot,
} from "../src/index";

function snapshot(overrides: Partial<HubAuthoritySnapshot> = {}): HubAuthoritySnapshot {
  const value: HubAuthoritySnapshot = {
    canonicalHubUserId: "hub_user_123",
    clerkUserId: "user_clerk_123",
    userStatus: "active",
    canonicalOrganizationId: "org_123",
    organizationStatus: "active",
    membershipId: "mem_123",
    membershipStatus: "active",
    memberRoles: ["customer_admin"],
    resolvedPermissions: ["org:dashboard:view"],
    appKey: "governance",
    appRegistryStatus: "active",
    productEntitlementStatus: "active",
    entitlementStartsAt: "2026-01-01T00:00:00.000Z",
    entitlementExpiresAt: "2027-01-01T00:00:00.000Z",
    planTier: "enterprise",
    cache: {
      issuedAt: "2026-05-30T12:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      ttlSeconds: 60,
      authorityVersion: 1,
      authorityHash: "",
    },
    decision: {
      allow: true,
      outcome: "allow",
      denyReason: null,
      requiredRemediation: null,
    },
    ...overrides,
  };
  value.cache.authorityHash = hashAuthoritySnapshot(value);
  return value;
}

test("mock Hub success", async () => {
  const snap = snapshot();
  const client = createHubServiceClient({
    hubBaseUrl: "https://suite.example",
    sourceAppKey: "proposal",
    serviceToken: "secret",
    fetchImpl: async () => Response.json({ ok: true, snapshot: snap }),
  });
  const result = await client.resolveHubAppAccess({
    clerkUserId: "user_clerk_123",
    appKey: "governance",
    requestedOrgId: "org_123",
  });
  assert.equal(result.decision.allow, true);
});

test("mock Hub deny", async () => {
  const denied = snapshot({
    resolvedPermissions: [],
    decision: {
      allow: false,
      outcome: "deny",
      denyReason: "entitlement_missing",
      requiredRemediation: "Enable entitlement.",
    },
  });
  denied.cache.authorityHash = hashAuthoritySnapshot(denied);
  const client = createHubServiceClient({
    hubBaseUrl: "https://suite.example",
    sourceAppKey: "proposal",
    serviceToken: "secret",
    fetchImpl: async () => Response.json({ ok: true, snapshot: denied }, { status: 403 }),
  });
  await assert.rejects(
    client.resolveHubAppAccess({
      clerkUserId: "user_clerk_123",
      appKey: "governance",
      requestedOrgId: "org_denied",
    }),
    HubAccessDeniedError,
  );
});

test("mock Hub unavailable", async () => {
  const client = createHubServiceClient({
    hubBaseUrl: "https://suite.example",
    sourceAppKey: "proposal",
    serviceToken: "secret",
    fetchImpl: async () => Response.json({ error: "down" }, { status: 503 }),
  });
  await assert.rejects(
    client.resolveHubAppAccess({ clerkUserId: "user", appKey: "governance", requestedOrgId: "org" }),
    HubUnavailableError,
  );
});

test("expired cache rejected for privileged route", () => {
  const expired = snapshot({
    cache: {
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:01:00.000Z",
      ttlSeconds: 60,
      authorityVersion: 1,
      authorityHash: "",
    },
  });
  expired.cache.authorityHash = hashAuthoritySnapshot(expired);
  assert.throws(
    () => verifyAuthoritySnapshot(expired, { now: new Date("2026-05-30T12:00:00.000Z"), privileged: true }),
    HubContractValidationError,
  );
});

test("malformed payload rejected", () => {
  assert.throws(() => verifyAuthoritySnapshot({} as HubAuthoritySnapshot), HubContractValidationError);
});

test("invalid signature rejected", () => {
  const tampered = snapshot();
  tampered.resolvedPermissions = ["org:admin"];
  assert.throws(() => verifyAuthoritySnapshot(tampered), HubContractValidationError);
});

test("audit event emission failure", async () => {
  const client = createHubServiceClient({
    hubBaseUrl: "https://suite.example",
    sourceAppKey: "proposal",
    serviceToken: "secret",
    fetchImpl: async () => Response.json({ error: "invalid" }, { status: 400 }),
  });
  await assert.rejects(
    client.emitHubAuditEvent({
      appKey: "proposal",
      eventType: "proposal.updated",
      eventCategory: "system",
      action: "Updated proposal",
    }),
    HubUnavailableError,
  );
});
