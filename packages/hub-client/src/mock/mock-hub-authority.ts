import type { HubAuthorityClient, ResolveAppAccessInput } from "../hub-authority-client";
import type { HubAccessSnapshot } from "../types/authority-snapshot";
import type { HubAppEntitlement } from "../types/entitlement";
import type { HubOrgMembership } from "../types/access";
import type { HubOrganization } from "../types/organization";
import type { HubUserProfile } from "../types/user";
import { DEFAULT_MOCK_FIXTURES } from "./fixtures";

export interface MockHubAuthorityOptions {
  fixtures: {
    users: HubUserProfile[];
    orgs: HubOrganization[];
    memberships: HubOrgMembership[];
    entitlements: HubAppEntitlement[];
  };
  defaultAllowed?: boolean;
}

function findUser(users: HubUserProfile[], clerkUserId: string): HubUserProfile | undefined {
  return users.find((user) => user.clerkUserId === clerkUserId);
}

function findOrg(orgs: HubOrganization[], clerkOrgId?: string): HubOrganization | undefined {
  if (!clerkOrgId) return orgs[0];
  return orgs.find((org) => org.clerkOrgId === clerkOrgId || org.id === clerkOrgId || org.slug === clerkOrgId);
}

function findMembership(
  memberships: HubOrgMembership[],
  userId: string,
  organizationId: string,
): HubOrgMembership | undefined {
  return memberships.find(
    (membership) => membership.userId === userId && membership.organizationId === organizationId,
  );
}

function findEntitlements(
  entitlements: HubAppEntitlement[],
  appKey: ResolveAppAccessInput["appKey"],
  organizationId: string,
): HubAppEntitlement[] {
  return entitlements.filter(
    (entitlement) => entitlement.appKey === appKey && entitlement.organizationId === organizationId,
  );
}

function buildDeniedSnapshot(
  user: HubUserProfile,
  org: HubOrganization | undefined,
  reason: string,
): HubAccessSnapshot {
  return {
    allowed: false,
    user,
    tenant: {
      organizationId: org?.id ?? "",
      clerkOrgId: org?.clerkOrgId ?? undefined,
    },
    membership: {
      userId: user.id,
      organizationId: org?.id ?? "",
      role: "none",
      status: "inactive",
    },
    entitlements: [],
    resolvedAt: new Date().toISOString(),
    reason,
  };
}

export function createMockHubAuthority(opts: MockHubAuthorityOptions): HubAuthorityClient {
  const fixtures = opts.fixtures;
  const defaultAllowed = opts.defaultAllowed ?? true;

  return {
    async resolveAppAccess(input: ResolveAppAccessInput): Promise<HubAccessSnapshot> {
      const user = findUser(fixtures.users, input.clerkUserId);
      if (!user) {
        return buildDeniedSnapshot(
          {
            id: "",
            clerkUserId: input.clerkUserId,
            email: "",
            displayName: input.clerkUserId,
            status: "inactive",
          },
          undefined,
          "user_not_found",
        );
      }

      const org = findOrg(fixtures.orgs, input.clerkOrgId);
      if (!org) {
        return buildDeniedSnapshot(user, undefined, "organization_not_found");
      }

      const membership = findMembership(fixtures.memberships, user.id, org.id);
      if (!membership || membership.status !== "active") {
        return buildDeniedSnapshot(user, org, "membership_inactive");
      }

      const entitlements = findEntitlements(fixtures.entitlements, input.appKey, org.id);
      const hasEntitlement = entitlements.some((entitlement) => entitlement.status === "active");
      const allowed = defaultAllowed && hasEntitlement;

      return {
        allowed,
        user,
        tenant: {
          organizationId: org.id,
          subtenantId: input.subtenantId,
          clerkOrgId: org.clerkOrgId ?? input.clerkOrgId,
        },
        membership,
        entitlements: allowed ? entitlements : [],
        resolvedAt: new Date().toISOString(),
        reason: allowed ? undefined : "entitlement_missing",
      };
    },
  };
}

export function createDefaultMockHubAuthority(): HubAuthorityClient {
  return createMockHubAuthority({ fixtures: DEFAULT_MOCK_FIXTURES });
}
