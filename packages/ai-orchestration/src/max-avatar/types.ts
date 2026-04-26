/**
 * MacTech Suite Platform — Max Avatar Type Contracts
 *
 * Defines the typed interfaces for future Max Avatar trigger integration.
 *
 * Max Avatar is the AI onboarding/help assistant layer. These types define
 * the contract for triggering Max — they do NOT implement any AI behavior.
 *
 * Boundaries:
 * - Business logic must NOT call Max Avatar directly.
 * - Max triggers are emitted as typed events through the neural layer.
 * - The neural layer routes triggers to the Max Avatar service (future phase).
 * - No external AI API calls are made in this scaffold.
 *
 * MT-NEURAL-001: Interfaces only. No implementation, no AI calls.
 */

// ============================================================================
// MAX TRIGGER EVENT
// ============================================================================

/**
 * A typed event representing a trigger point for the Max Avatar.
 *
 * These events are emitted by the neural layer when a user action,
 * error state, or onboarding condition matches a registered Max anchor.
 *
 * Tenant isolation: tenantId is required on every event.
 * Traceability: requestId links the trigger to the originating API request.
 *
 * triggerType:
 *   "error"       — An application error occurred at this anchor.
 *   "onboarding"  — A new user encountered this anchor for the first time.
 *   "how_to"      — User requested contextual help at this anchor.
 *   "warning"     — A warning condition was detected at this anchor.
 *
 * severity:
 *   "info"      — Informational; no immediate action required.
 *   "warning"   — Soft warning; may prompt a suggestion.
 *   "critical"  — Critical condition; Max may proactively intervene (future).
 */
export type MaxTriggerEvent = {
  tenantId: string;
  userId?: string;
  requestId?: string;
  anchorId: string;
  triggerType: "error" | "onboarding" | "how_to" | "warning";
  severity: "info" | "warning" | "critical";
  context: Record<string, unknown>;
};
