import type { MacTechAppKey } from "./app-key";

/** Consumer view of Hub ProductEntitlement / app access — adapter over live authority snapshot. */
export interface HubAppEntitlement {
  appKey: MacTechAppKey;
  organizationId: string;
  status: "active" | "inactive";
  features?: string[];
}
