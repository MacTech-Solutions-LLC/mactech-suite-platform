/**
 * MacTech Suite Platform — Digital Twin / Shadow-Test Type Contracts
 *
 * Defines the typed interface for shadow-test requests routed to the
 * Digital Twin QA layer.
 *
 * Shadow tests allow the neural layer to observe or simulate API requests
 * without mutating production data or blocking user workflows.
 *
 * Boundaries:
 * - Shadow tests must NEVER mutate production data.
 * - Shadow tests must NEVER block or delay user-facing workflows.
 * - "simulate" mode routes here; in v1 this is a no-op stub.
 * - These types define the contract; implementation is a future phase.
 *
 * MT-NEURAL-001: Interface only. No simulation logic implemented.
 */

// ============================================================================
// SHADOW TEST REQUEST
// ============================================================================

/**
 * A typed record of an API request that has been flagged for shadow analysis.
 *
 * Created by the gateway when x-mactech-shadow-test: observe | simulate is present.
 *
 * Tenant isolation: tenantId is required.
 * Privacy: inputShapeHash is a hash of the request payload shape — never raw data.
 * Traceability: requestId links back to the originating API request.
 *
 * mode:
 *   "observe"  — Record that this request was eligible for shadow analysis.
 *   "simulate" — Route to Digital Twin QA for structural replay (no-op in v1).
 *
 * riskSignals:
 *   Categorical labels only (e.g., "mutation", "pii_fields_present").
 *   Never include raw field values.
 */
export type ShadowTestRequest = {
  tenantId: string;
  requestId: string;
  endpoint: string;
  method: string;
  inputShapeHash: string;
  mode: "observe" | "simulate";
  riskSignals: string[];
};
