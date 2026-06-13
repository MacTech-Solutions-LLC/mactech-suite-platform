import type { HubAppEntitlement } from "./entitlement";
import type { SuiteOrgContextUx } from "../org-context/ux";
import type { HubOrgMembership } from "./access";
import type { HubTenantContext } from "./tenant-context";
import type { HubUserProfile } from "./user";
import type { ContractAccessEntry } from "../types";

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
  /** Hub-issued contract memberships for this user (non-CLOSEOUT only). */
  contractAccess: ContractAccessEntry[];
  resolvedAt: string;
  reason?: string;
  /** Derived org UX policy for Clerk/session binding (DR-2026-06-13-01). */
  orgContext?: SuiteOrgContextUx;
}
