/**
 * MacTech Suite Platform — Shared Type Contracts
 *
 * This file defines the core type contracts used across the MacTech platform.
 * Types here are interface/contract only — no runtime behavior.
 *
 * Tenant isolation, request context, and API response shapes are defined here
 * so that all layers (Standard and Neural) share a single source of truth.
 *
 * MT-NEURAL-001: Initial scaffold — contracts only, no runtime changes.
 */

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Canonical error codes used in all ApiResponse error payloads.
 * These are safe to expose to clients. Internal details stay server-side.
 */
export const ErrorCodes = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  TENANT_REQUIRED: "TENANT_REQUIRED",
  TENANT_ACCESS_DENIED: "TENANT_ACCESS_DENIED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  TELEMETRY_FAILURE: "TELEMETRY_FAILURE",
  SHADOW_TEST_REJECTED: "SHADOW_TEST_REJECTED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// API RESPONSE ENVELOPE
// ============================================================================

/**
 * Standard API response envelope for all MacTech endpoints.
 *
 * All responses — success or failure — must use this shape.
 * requestId is always included for traceability.
 *
 * Usage:
 *   return NextResponse.json<ApiResponse<TenantData>>({
 *     ok: true,
 *     data: tenant,
 *     requestId: ctx.requestId,
 *   });
 */
export type ApiResponse<T> =
  | {
      ok: true;
      data: T;
      requestId: string;
    }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        message: string;
        details?: unknown;
      };
      requestId: string;
    };

// ============================================================================
// SHADOW-STATE MODE
// ============================================================================

/**
 * Shadow mode values parsed from the x-mactech-shadow-test header.
 *
 * off      — No shadow behavior. Normal production request.
 * observe  — Emit shadow telemetry metadata only. No simulation.
 * simulate — Route to ShadowTestRequest handler (no-op stub in v1).
 */
export type ShadowMode = "off" | "observe" | "simulate";

/**
 * Resolved shadow-state context attached to every RequestContext.
 * Source tracks where the mode was determined from.
 */
export type ShadowContext = {
  enabled: boolean;
  mode: ShadowMode;
  source: "header" | "feature_flag" | "system_default";
};

// ============================================================================
// REQUEST CONTEXT
// ============================================================================

/**
 * The canonical typed context attached to every authenticated API request.
 *
 * This is constructed at the gateway layer from:
 * - The resolved MacTechAuthContext (internal user + tenant IDs)
 * - The parsed x-mactech-shadow-test header
 * - A generated requestId for traceability
 *
 * Business logic must consume this context — never raw HTTP headers or
 * external provider IDs (Clerk IDs must not flow past the auth adapter).
 *
 * Security: roles and permissions are resolved server-side, never trusted
 * from the client.
 */
export type RequestContext = {
  requestId: string;
  tenantId: string;
  userId: string;
  roles: string[];
  permissions: string[];
  shadow: ShadowContext;
};

// ============================================================================
// MAX ANCHOR PROPS (Component Anchoring Convention)
// ============================================================================

/**
 * Optional props that any reusable UI component may accept to support
 * future Max Avatar integration.
 *
 * Anchors must follow the naming convention:
 *   domain.feature.component.action
 *
 * Examples:
 *   auth.login.submit
 *   reports.generate.submit
 *   dashboard.kpi.card
 *   quality.checklist.item
 *   training.module.start
 *   capture.upload.dropzone
 *
 * Rules:
 * - Anchors must be stable identifiers (do not change without a migration).
 * - Anchors must not contain user data, tenant data, or secrets.
 * - Anchors must be documented in docs/ai-hooks/max-anchors.md.
 * - Anchors must be human-readable and machine-parseable.
 *
 * Usage:
 *   <Button data-max-anchor="reports.generate.submit" data-max-context="Generate Report Submit Button">
 *     Generate Report
 *   </Button>
 */
export type MaxAnchorProps = {
  "data-max-anchor"?: string;
  "data-max-context"?: string;
};
