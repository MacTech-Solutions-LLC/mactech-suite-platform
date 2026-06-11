import type { HubAccessSnapshot } from "../types/authority-snapshot";
import type { HubAppEntitlement } from "../types/entitlement";
import type { MacTechAppKey } from "../types/app-key";
import type { HubAuthoritySnapshot } from "../types";

function mapUserStatus(status: string | null): HubAccessSnapshot["user"]["status"] {
  if (status === "inactive") return "inactive";
  if (status === "suspended") return "suspended";
  return "active";
}

function mapMembershipStatus(status: string | null): HubAccessSnapshot["membership"]["status"] {
  return status === "inactive" ? "inactive" : "active";
}

function mapEntitlementStatus(status: string | null): HubAppEntitlement["status"] {
  return status === "active" ? "active" : "inactive";
}

/**
 * Maps live Hub authority snapshot to consumer-facing HubAccessSnapshot.
 * Runtime {@link HubAuthoritySnapshot} remains canonical — this is a read adapter only.
 */
export function toHubAccessSnapshot(
  live: HubAuthoritySnapshot,
  options?: { clerkOrgId?: string; subtenantId?: string },
): HubAccessSnapshot {
  const allowed = live.decision.allow;
  const organizationId = live.canonicalOrganizationId ?? "";
  const userId = live.canonicalHubUserId ?? "";

  const entitlements: HubAppEntitlement[] = [
    {
      appKey: live.appKey as MacTechAppKey,
      organizationId,
      status: mapEntitlementStatus(live.productEntitlementStatus),
      features: live.resolvedPermissions.length > 0 ? [...live.resolvedPermissions] : undefined,
    },
  ];

  return {
    allowed,
    user: {
      id: userId,
      clerkUserId: live.clerkUserId,
      email: "",
      displayName: live.clerkUserId,
      status: mapUserStatus(live.userStatus),
    },
    tenant: {
      organizationId,
      subtenantId: options?.subtenantId,
      clerkOrgId: options?.clerkOrgId,
    },
    membership: {
      userId,
      organizationId,
      role: live.memberRoles[0] ?? "member",
      status: mapMembershipStatus(live.membershipStatus),
    },
    entitlements,
    resolvedAt: live.cache.issuedAt,
    reason: live.decision.denyReason ?? undefined,
  };
}
