/** Consumer view of Hub CustomerOrganization — adapter over live authority snapshot. */
export interface HubOrganization {
  id: string;
  clerkOrgId: string | null;
  slug: string;
  name: string;
  status: "active" | "inactive";
}
