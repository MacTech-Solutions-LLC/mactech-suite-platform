/** Canonical app keys â€” see mactech-suite-workspace-control/canonical-app-keys.md */
export type MacTechAppKey =
  | "hub"
  | "training"
  | "qms"
  | "governance"
  | "growth-capture"
  | "finance"
  | "proposal"
  | "bizops"
  | "contracts-delivery"
  | "client-portal"
  | "workspace-gateway";

export const MACTECH_APP_KEYS: readonly MacTechAppKey[] = [
  "hub",
  "training",
  "qms",
  "governance",
  "growth-capture",
  "finance",
  "proposal",
  "bizops",
  "contracts-delivery",
  "client-portal",
  "workspace-gateway",
] as const;

export function isMacTechAppKey(value: string): value is MacTechAppKey {
  return (MACTECH_APP_KEYS as readonly string[]).includes(value);
}
