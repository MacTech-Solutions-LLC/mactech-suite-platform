import type { HubAppEntitlement } from "./entitlement";
import type { HubOrgMembership } from "./access";
import type { HubTenantContext } from "./tenant-context";
import type { HubUserProfile } from "./user";

/**
 * Consumer-facing authority snapshot (HUB_AUTH_CONTRACT_V1_SPEC §3).
 * Adapter view over live HubAuthoritySnapshot — do not replace runtime types.
 */
export interface HubAccessSnapshot {
  allowed: boolean;
  user: HubUserProfile;
  tenant: HubTenantContext;
  membership: HubOrgMembership;
  entitlements: HubAppEntitlement[];
  resolvedAt: string;
  reason?: string;
}
