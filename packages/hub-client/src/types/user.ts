/** Consumer view of Hub UserProfile — adapter over live authority snapshot. */
export interface HubUserProfile {
  id: string;
  clerkUserId: string;
  email: string;
  displayName: string;
  status: "active" | "inactive" | "suspended";
}
