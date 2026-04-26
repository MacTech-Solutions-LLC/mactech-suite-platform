/**
 * MacTech Suite Platform — Telemetry Event Constructor
 *
 * Provides typed factory functions for constructing privacy-safe telemetry events.
 *
 * Using constructors (rather than plain object literals) enforces:
 * - Required field presence
 * - Correct eventSource labeling
 * - No accidental PII leakage via metadata
 *
 * Privacy enforcement is the responsibility of the caller: never pass raw
 * request/response bodies, secrets, tokens, or unredacted PII into metadata.
 *
 * MT-NEURAL-001: Constructor types and factories only. No emitter, no storage.
 */

import type {
  TelemetryEvent,
  TelemetryEventSource,
  TelemetryEventType,
} from "./types";
import { TelemetryEventSources } from "./types";
import type { ShadowContext } from "../../types/index";

// ============================================================================
// BASE CONSTRUCTOR
// ============================================================================

/**
 * Input for constructing a telemetry event.
 * Required fields are enforced; all others are optional.
 */
export type TelemetryEventInput = {
  tenantId: string;
  eventType: TelemetryEventType;
  eventSource?: TelemetryEventSource;
  userId?: string;
  requestId?: string;
  sessionId?: string;
  componentAnchor?: string;
  route?: string;
  apiEndpoint?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  shadow?: ShadowContext;
  payloadHash?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Constructs a typed, privacy-safe TelemetryEvent from input.
 *
 * The eventSource defaults to "telemetry" if not provided.
 * Shadow fields are mapped from the ShadowContext if present.
 *
 * @param input - Caller-provided event data
 * @returns A fully typed TelemetryEvent ready for emission
 */
export function buildTelemetryEvent(input: TelemetryEventInput): TelemetryEvent {
  const {
    tenantId,
    eventType,
    eventSource = TelemetryEventSources.TELEMETRY_PACKAGE,
    userId,
    requestId,
    sessionId,
    componentAnchor,
    route,
    apiEndpoint,
    method,
    statusCode,
    durationMs,
    shadow,
    payloadHash,
    metadata,
  } = input;

  return {
    tenantId,
    eventType,
    eventSource,
    ...(userId !== undefined && { userId }),
    ...(requestId !== undefined && { requestId }),
    ...(sessionId !== undefined && { sessionId }),
    ...(componentAnchor !== undefined && { componentAnchor }),
    ...(route !== undefined && { route }),
    ...(apiEndpoint !== undefined && { apiEndpoint }),
    ...(method !== undefined && { method }),
    ...(statusCode !== undefined && { statusCode }),
    ...(durationMs !== undefined && { durationMs }),
    ...(shadow !== undefined && {
      shadowEnabled: shadow.enabled,
      shadowMode: shadow.mode,
    }),
    ...(payloadHash !== undefined && { payloadHash }),
    ...(metadata !== undefined && { metadata }),
  };
}

// ============================================================================
// CONVENIENCE CONSTRUCTORS
// ============================================================================

/**
 * Constructs a telemetry event for an API request/response cycle.
 */
export function buildApiTelemetryEvent(
  input: TelemetryEventInput & {
    apiEndpoint: string;
    method: string;
    statusCode: number;
    durationMs: number;
  }
): TelemetryEvent {
  return buildTelemetryEvent({
    ...input,
    eventSource: TelemetryEventSources.API_GATEWAY,
  });
}

/**
 * Constructs a telemetry event for a UI component interaction.
 */
export function buildComponentTelemetryEvent(
  input: TelemetryEventInput & {
    componentAnchor: string;
  }
): TelemetryEvent {
  return buildTelemetryEvent({
    ...input,
    eventSource: TelemetryEventSources.UI_COMPONENT,
  });
}

/**
 * Constructs a telemetry event for a shadow-test observation.
 */
export function buildShadowTelemetryEvent(
  input: TelemetryEventInput & {
    shadow: ShadowContext;
    apiEndpoint: string;
    method: string;
  }
): TelemetryEvent {
  return buildTelemetryEvent({
    ...input,
    eventSource: TelemetryEventSources.NEURAL_LAYER,
  });
}
