import type { HubAccessSnapshot } from "../types/authority-snapshot";
import type { HubAppEntitlement } from "../types/entitlement";
import type { MacTechAppKey } from "../types/app-key";
import type { HubAuthoritySnapshot, ContractAccessEntry } from "../types";
import { deriveSuiteOrgContextUx } from "../org-context/ux";

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
  const allowed = live.decision?.allow ?? false;
  const organizationId = live.canonicalOrganizationId ?? "";
  const userId = live.canonicalHubUserId ?? "";
  const resolvedPermissions = Array.isArray(live.resolvedPermissions) ? live.resolvedPermissions : [];

  const entitlements: HubAppEntitlement[] = [
    {
      appKey: live.appKey as MacTechAppKey,
      organizationId,
      status: mapEntitlementStatus(live.productEntitlementStatus),
      features: resolvedPermissions.length > 0 ? [...resolvedPermissions] : undefined,
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
      clerkOrgId: options?.clerkOrgId ?? live.sessionContext?.boundClerkOrgId ?? undefined,
    },
    membership: {
      userId,
      organizationId,
      role: live.memberRoles?.[0] ?? "member",
      status: mapMembershipStatus(live.membershipStatus),
    },
    entitlements,
    contractAccess: Array.isArray(live.contractAccess)
      ? (live.contractAccess as ContractAccessEntry[])
      : [],
    resolvedAt: live.cache?.issuedAt ?? new Date().toISOString(),
    reason: live.decision?.denyReason ?? undefined,
    orgContext: deriveSuiteOrgContextUx(live.sessionContext ?? null),
  };
}
