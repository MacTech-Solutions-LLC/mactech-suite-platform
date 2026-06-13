export {
  createHubServiceClient,
  emitHubAuditEvent,
  requireHubAppAccess,
  resolveHubAppAccess,
  resolveSuiteObjectRef,
} from "./client";
export {
  assertSnapshotShape,
  hashAuthoritySnapshot,
  verifyAuthoritySnapshot,
} from "./snapshot";
export {
  HubAccessDeniedError,
  HubContractValidationError,
  HubServiceAuthError,
  HubUnavailableError,
} from "./errors";
export { toHubAccessSnapshot } from "./adapter/snapshot-adapter";
export {
  createLiveHubAuthorityClient,
  type HubAuthorityClient,
  type ResolveAppAccessInput,
} from "./hub-authority-client";
export {
  createHubAuthorityClient,
  type CreateHubAuthorityClientOptions,
  type HubAuthorityMode,
} from "./factory";
export {
  createDefaultMockHubAuthority,
  createMockHubAuthority,
  type MockHubAuthorityOptions,
} from "./mock/mock-hub-authority";
export { DEFAULT_MOCK_FIXTURES } from "./mock/fixtures";
export type {
  ContractAccessEntry,
  HubAuditEventInput,
  HubAuditEventResult,
  HubAuthorityDecision,
  HubAuthorityRequest,
  HubAuthoritySnapshot,
  HubClientConfig,
  RequireHubAccessOptions,
  SuiteObjectReference,
  SuiteObjectReferenceInput,
} from "./types";
export type { MacTechAppKey } from "./types/app-key";
export { MACTECH_APP_KEYS, isMacTechAppKey } from "./types/app-key";
export type { HubUserProfile } from "./types/user";
export type { HubOrganization } from "./types/organization";
export type { HubTenantContext } from "./types/tenant-context";
export type { HubOrgMembership } from "./types/access";
export type { HubAppEntitlement } from "./types/entitlement";
export type { HubAccessSnapshot } from "./types/authority-snapshot";
export type { ApiError, ApiResponse, ApiSuccess } from "./types/api-envelope";
export {
  deriveSuiteOrgContextUx,
  type HubSessionContext,
  type SuiteOrgContextMode,
  type SuiteOrgContextUx,
} from "./org-context/ux";
export {
  HUB_AUTH_DENIED,
  HUB_UNAVAILABLE,
  VALIDATION_ERROR,
} from "./types/api-envelope";
