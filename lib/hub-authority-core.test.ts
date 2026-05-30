import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHubAuthorityRecords,
  hashAuthoritySnapshot,
  type AuthorityEvaluationRecords,
  type HubAuthorityRequest,
} from "./hub-authority-core";

const now = new Date("2026-05-30T12:00:00.000Z");

const request: HubAuthorityRequest = {
  clerkUserId: "user_clerk_123",
  appKey: "governance",
  requestedOrgId: "org_123",
  requestId: "req_123",
  service: { sourceAppKey: "proposal", authMethod: "service_token" },
};

const baseRecords: AuthorityEvaluationRecords = {
  serviceValid: true,
  sourceAppKnown: true,
  app: {
    id: "app_123",
    appKey: "governance",
    status: "active",
    requiresOrgContext: true,
    isInternalOnly: false,
    authorityVersion: 1,
    updatedAt: now,
  },
  user: {
    id: "hub_user_123",
    clerkUserId: "user_clerk_123",
    status: "active",
    isInternalMacTechUser: false,
    platformRole: "none",
    authorityVersion: 1,
    updatedAt: now,
  },
  organization: {
    id: "org_123",
    status: "active",
    authorityVersion: 1,
    updatedAt: now,
  },
  membership: {
    id: "mem_123",
    status: "active",
    role: "customer_admin",
    permissionsJson: ["org:dashboard:view"],
    authorityVersion: 1,
    updatedAt: now,
  },
  entitlement: {
    id: "ent_123",
    enabled: true,
    status: "active",
    plan: "enterprise",
    startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    authorityVersion: 1,
    updatedAt: now,
  },
};

test("allows an active user, org, membership, app, and entitlement", () => {
  const snapshot = evaluateHubAuthorityRecords(request, baseRecords, { now });
  assert.equal(snapshot.decision.allow, true);
  assert.equal(snapshot.canonicalHubUserId, "hub_user_123");
  assert.deepEqual(snapshot.resolvedPermissions, ["org:dashboard:view"]);
  assert.equal(snapshot.cache.authorityHash, hashAuthoritySnapshot(snapshot));
});

test("revoked user denied", () => {
  const snapshot = evaluateHubAuthorityRecords(
    request,
    { ...baseRecords, user: { ...baseRecords.user!, status: "revoked" } },
    { now },
  );
  assert.equal(snapshot.decision.allow, false);
  assert.equal(snapshot.decision.denyReason, "user_inactive");
});

test("suspended org denied", () => {
  const snapshot = evaluateHubAuthorityRecords(
    request,
    { ...baseRecords, organization: { ...baseRecords.organization!, status: "suspended" } },
    { now },
  );
  assert.equal(snapshot.decision.denyReason, "organization_inactive");
});

test("expired entitlement denied", () => {
  const snapshot = evaluateHubAuthorityRecords(
    request,
    {
      ...baseRecords,
      entitlement: {
        ...baseRecords.entitlement!,
        status: "expired",
        expiresAt: "2026-01-01T00:00:00.000Z",
      },
    },
    { now },
  );
  assert.equal(snapshot.decision.denyReason, "entitlement_expired");
});

test("inactive app denied", () => {
  const snapshot = evaluateHubAuthorityRecords(
    request,
    { ...baseRecords, app: { ...baseRecords.app!, status: "inactive" } },
    { now },
  );
  assert.equal(snapshot.decision.denyReason, "app_inactive");
});

test("missing app registry row denied", () => {
  const snapshot = evaluateHubAuthorityRecords(
    request,
    { ...baseRecords, app: null },
    { now },
  );
  assert.equal(snapshot.decision.denyReason, "app_registry_missing");
});

test("inactive membership denied", () => {
  const snapshot = evaluateHubAuthorityRecords(
    request,
    { ...baseRecords, membership: { ...baseRecords.membership!, status: "inactive" } },
    { now },
  );
  assert.equal(snapshot.decision.denyReason, "membership_inactive");
});

test("invalid service token denied", () => {
  const snapshot = evaluateHubAuthorityRecords(
    request,
    { ...baseRecords, serviceValid: false },
    { now },
  );
  assert.equal(snapshot.decision.denyReason, "service_identity_invalid");
});
