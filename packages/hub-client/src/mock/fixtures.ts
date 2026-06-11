import type { HubAppEntitlement } from "../types/entitlement";
import type { HubOrgMembership } from "../types/access";
import type { HubOrganization } from "../types/organization";
import type { HubUserProfile } from "../types/user";

export const FIXTURE_USER_ADMIN: HubUserProfile = {
  id: "hub_user_admin",
  clerkUserId: "user_clerk_admin",
  email: "admin@example.mactech.dev",
  displayName: "Dev Admin",
  status: "active",
};

export const FIXTURE_USER_MEMBER: HubUserProfile = {
  id: "hub_user_member",
  clerkUserId: "user_clerk_member",
  email: "member@example.mactech.dev",
  displayName: "Dev Member",
  status: "active",
};

export const FIXTURE_ORG_ACME: HubOrganization = {
  id: "org_acme",
  clerkOrgId: "org_clerk_acme",
  slug: "acme",
  name: "Acme Dev Org",
  status: "active",
};

export const FIXTURE_MEMBERSHIPS: HubOrgMembership[] = [
  {
    userId: FIXTURE_USER_ADMIN.id,
    organizationId: FIXTURE_ORG_ACME.id,
    role: "customer_admin",
    status: "active",
  },
  {
    userId: FIXTURE_USER_MEMBER.id,
    organizationId: FIXTURE_ORG_ACME.id,
    role: "member",
    status: "active",
  },
];

export const FIXTURE_ENTITLEMENTS: HubAppEntitlement[] = [
  { appKey: "training", organizationId: FIXTURE_ORG_ACME.id, status: "active" },
  { appKey: "qms", organizationId: FIXTURE_ORG_ACME.id, status: "active" },
  { appKey: "governance", organizationId: FIXTURE_ORG_ACME.id, status: "active" },
  { appKey: "growth-capture", organizationId: FIXTURE_ORG_ACME.id, status: "active" },
  { appKey: "pricing", organizationId: FIXTURE_ORG_ACME.id, status: "active" },
  { appKey: "proposal", organizationId: FIXTURE_ORG_ACME.id, status: "active" },
  { appKey: "bizops", organizationId: FIXTURE_ORG_ACME.id, status: "active" },
  { appKey: "contracts-delivery", organizationId: FIXTURE_ORG_ACME.id, status: "active" },
  { appKey: "client-portal", organizationId: FIXTURE_ORG_ACME.id, status: "active" },
];

export const DEFAULT_MOCK_FIXTURES = {
  users: [FIXTURE_USER_ADMIN, FIXTURE_USER_MEMBER],
  orgs: [FIXTURE_ORG_ACME],
  memberships: FIXTURE_MEMBERSHIPS,
  entitlements: FIXTURE_ENTITLEMENTS,
};
