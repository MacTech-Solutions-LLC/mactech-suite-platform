/** Active org + optional subtenant context resolved by Hub. */
export interface HubTenantContext {
  organizationId: string;
  subtenantId?: string;
  clerkOrgId?: string;
}
