import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultMockHubAuthority,
  createHubAuthorityClient,
  createMockHubAuthority,
  hashAuthoritySnapshot,
  toHubAccessSnapshot,
  type HubAuthoritySnapshot,
} from "../src/index";
import { DEFAULT_MOCK_FIXTURES } from "../src/mock/fixtures";

function liveSnapshot(overrides: Partial<HubAuthoritySnapshot> = {}): HubAuthoritySnapshot {
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

test("toHubAccessSnapshot maps live snapshot to consumer view", () => {
  const adapted = toHubAccessSnapshot(liveSnapshot(), { clerkOrgId: "org_clerk_123" });
  assert.equal(adapted.allowed, true);
  assert.equal(adapted.user.id, "hub_user_123");
  assert.equal(adapted.tenant.organizationId, "org_123");
  assert.equal(adapted.tenant.clerkOrgId, "org_clerk_123");
  assert.equal(adapted.membership.role, "customer_admin");
  assert.equal(adapted.entitlements[0]?.appKey, "governance");
  assert.deepEqual(adapted.entitlements[0]?.features, ["org:dashboard:view"]);
});

test("toHubAccessSnapshot maps deny reason", () => {
  const adapted = toHubAccessSnapshot(
    liveSnapshot({
      decision: {
        allow: false,
        outcome: "deny",
        denyReason: "entitlement_missing",
        requiredRemediation: "Enable entitlement.",
      },
    }),
  );
  assert.equal(adapted.allowed, false);
  assert.equal(adapted.reason, "entitlement_missing");
});

test("createMockHubAuthority allows entitled user", async () => {
  const client = createMockHubAuthority({ fixtures: DEFAULT_MOCK_FIXTURES });
  const snapshot = await client.resolveAppAccess({
    appKey: "training",
    clerkUserId: "user_clerk_admin",
    clerkOrgId: "org_clerk_acme",
    mode: "user_session",
  });
  assert.equal(snapshot.allowed, true);
  assert.equal(snapshot.user.id, "hub_user_admin");
  assert.equal(snapshot.tenant.organizationId, "org_acme");
});

test("createMockHubAuthority denies missing entitlement", async () => {
  const client = createMockHubAuthority({ fixtures: DEFAULT_MOCK_FIXTURES });
  const snapshot = await client.resolveAppAccess({
    appKey: "workspace-gateway",
    clerkUserId: "user_clerk_admin",
    clerkOrgId: "org_clerk_acme",
    mode: "user_session",
  });
  assert.equal(snapshot.allowed, false);
  assert.equal(snapshot.reason, "entitlement_missing");
});

test("createHubAuthorityClient defaults to mock without live config", () => {
  const client = createHubAuthorityClient({ mode: "mock" });
  assert.equal(typeof client.resolveAppAccess, "function");
});

test("createDefaultMockHubAuthority returns working client", async () => {
  const client = createDefaultMockHubAuthority();
  const snapshot = await client.resolveAppAccess({
    appKey: "qms",
    clerkUserId: "user_clerk_member",
    clerkOrgId: "org_clerk_acme",
    mode: "user_session",
  });
  assert.equal(snapshot.allowed, true);
});
