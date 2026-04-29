/**
 * Maps MacTech customer roles → Clerk organization roles.
 *
 * Clerk's default org-role taxonomy is just `org:admin` and `org:member`.
 * Our 7-role customer plane is finer-grained, so we collapse it for
 * Clerk's purposes. The local `OrgUserAccess.role` remains the source of
 * truth for what the user can actually do; Clerk only needs to know
 * "admin or not" so its hosted UI components show the right controls.
 *
 * If you add new MacTech roles, decide here whether they should be a
 * Clerk admin (manage users + settings) or a regular member.
 */

const CLERK_ADMIN_ROLES = new Set<string>([
  "customer_owner",
  "customer_admin",
]);

export function localRoleToClerkRole(localRole: string): "org:admin" | "org:member" {
  return CLERK_ADMIN_ROLES.has(localRole) ? "org:admin" : "org:member";
}

export function isClerkAdminRole(localRole: string): boolean {
  return CLERK_ADMIN_ROLES.has(localRole);
}
