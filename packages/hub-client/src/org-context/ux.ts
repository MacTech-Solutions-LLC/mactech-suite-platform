export type SuiteOrgContextMode =
  | "tenant_bound"
  | "operator_multi_org"
  | "operator_single_org"
  | "unbound";

/** Hub-issued session hints for org UX (DR-2026-06-13-01). */
export interface HubSessionContext {
  isInternalMacTechUser: boolean;
  boundClerkOrgId: string | null;
  activeOrganizationCount: number;
}

export interface SuiteOrgContextUx {
  mode: SuiteOrgContextMode;
  showOrgSwitcher: boolean;
  showChooseOrganization: boolean;
  boundClerkOrgId: string | null;
}

export function deriveSuiteOrgContextUx(
  session: HubSessionContext | null | undefined,
): SuiteOrgContextUx {
  if (!session) {
    return {
      mode: "unbound",
      showOrgSwitcher: false,
      showChooseOrganization: false,
      boundClerkOrgId: null,
    };
  }

  const { isInternalMacTechUser, boundClerkOrgId, activeOrganizationCount } = session;

  if (!isInternalMacTechUser) {
    if (activeOrganizationCount === 1 && boundClerkOrgId) {
      return {
        mode: "tenant_bound",
        showOrgSwitcher: false,
        showChooseOrganization: false,
        boundClerkOrgId,
      };
    }
    if (activeOrganizationCount === 0) {
      return {
        mode: "unbound",
        showOrgSwitcher: false,
        showChooseOrganization: false,
        boundClerkOrgId: null,
      };
    }
    return {
      mode: "unbound",
      showOrgSwitcher: false,
      showChooseOrganization: false,
      boundClerkOrgId: null,
    };
  }

  if (activeOrganizationCount > 1) {
    return {
      mode: "operator_multi_org",
      showOrgSwitcher: true,
      showChooseOrganization: true,
      boundClerkOrgId,
    };
  }

  return {
    mode: "operator_single_org",
    showOrgSwitcher: true,
    showChooseOrganization: !boundClerkOrgId,
    boundClerkOrgId,
  };
}
