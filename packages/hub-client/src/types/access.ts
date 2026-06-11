/** Consumer view of Hub OrgUserAccess membership — adapter over live authority snapshot. */
export interface HubOrgMembership {
  userId: string;
  organizationId: string;
  role: string;
  status: "active" | "inactive";
}
