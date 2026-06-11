import { enforceAppAccess } from "./shared";

/** QMS satellite — Express-style middleware pattern (appKey: qms). */
export async function qmsProtectedHandler(clerkUserId: string, clerkOrgId?: string) {
  const snapshot = await enforceAppAccess("qms", clerkUserId, clerkOrgId);
  return {
    hubUserId: snapshot.user.id,
    hubOrganizationId: snapshot.tenant.organizationId,
    role: snapshot.membership.role,
  };
}
