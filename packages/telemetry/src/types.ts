/**
 * MacTech Suite Platform — Telemetry Type Contracts
 *
 * Defines the privacy-safe telemetry event structure used by the Neural Layer.
 *
 * Telemetry records behavioral/performance/UX events. It is strictly separate
 * from audit logging (which records security/compliance actions).
 *
 * Privacy Rules — Telemetry MUST NOT store:
 * - Raw passwords, API keys, access tokens, or refresh tokens
 * - Full request or response bodies
 * - Payment data or private customer content
 * - Unredacted PII
 * - Clerk secrets or environment secrets
 *
 * Telemetry MAY store:
 * - Tenant ID (internal MacTech ID only, never Clerk org_id)
 * - User ID (internal MacTech ID only, never Clerk user_id)
 * - Request ID
 * - Route, endpoint, HTTP method, status code, duration
 * - Error category (never raw error messages with PII)
 * - Component anchor ID
 * - Payload shape hash (hash of shape, never raw payload)
 * - Validation failure category
 * - Feature flag state
 * - Shadow-test mode
 *
 * MT-NEURAL-001: Type contracts only. No Prisma model. No storage in v1.
 */

import type { ShadowMode } from "../../types/index";

// ============================================================================
// TELEMETRY EVENT TYPE
// ============================================================================

/**
 * A privacy-safe telemetry event capturing one observable moment in the system.
 *
 * All fields are optional except tenantId and eventType, which are required
 * for minimum viable telemetry isolation and classification.
 *
 * This type mirrors the planned TelemetryEvent Prisma model (future phase).
 * Adding the model to the schema is explicitly deferred from MT-NEURAL-001.
 */
export type TelemetryEvent = {
  tenantId: string;
  userId?: string;
  requestId?: string;
  sessionId?: string;
  eventType: TelemetryEventType;
  eventSource: TelemetryEventSource;
  componentAnchor?: string;
  route?: string;
  apiEndpoint?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  shadowEnabled?: boolean;
  shadowMode?: ShadowMode;
  payloadHash?: string;
  metadata?: Record<string, unknown>;
};

// ============================================================================
// TELEMETRY EVENT ENUMS (as const for type safety)
// ============================================================================

/**
 * The category/type of telemetry event.
 *
 * Use these constants everywhere to avoid stringly-typed event names.
 */
export const TelemetryEventTypes = {
  API_REQUEST: "api.request",
  API_RESPONSE: "api.response",
  API_ERROR: "api.error",
  PAGE_VIEW: "ui.page_view",
  BUTTON_CLICK: "ui.button_click",
  VALIDATION_FAILED: "validation.failed",
  SHADOW_TEST_OBSERVED: "shadow.observed",
  SHADOW_TEST_SIMULATED: "shadow.simulated",
  MAX_ANCHOR_ENCOUNTERED: "max.anchor_encountered",
  CLIENT_ERROR_BOUNDARY: "ui.error_boundary",
} as const;

export type TelemetryEventType =
  (typeof TelemetryEventTypes)[keyof typeof TelemetryEventTypes];

/**
 * The source layer that emitted the event.
 */
export const TelemetryEventSources = {
  API_GATEWAY: "api.gateway",
  MIDDLEWARE: "middleware",
  UI_COMPONENT: "ui.component",
  TELEMETRY_PACKAGE: "telemetry",
  NEURAL_LAYER: "neural",
} as const;

export type TelemetryEventSource =
  (typeof TelemetryEventSources)[keyof typeof TelemetryEventSources];
