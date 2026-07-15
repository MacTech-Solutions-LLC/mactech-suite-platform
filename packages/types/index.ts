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
 * MT-NEURAL-002: Add actor/trigger model for AI and system-initiated actions.
 */

// ============================================================================
// ACTOR / TRIGGER MODEL
// ============================================================================

/**
 * Who or what initiated an action.
 *
 * USER          — A human user authenticated through Clerk.
 * SYSTEM        — The MacTech platform itself (e.g., scheduled jobs, webhooks).
 * AI_ASSISTANT  — A user-invoked AI assistant (e.g., Mini Mac responding to a user action).
 *                 Retains the invoking user's context. Does NOT get a separate DB user.
 * AI_BACKGROUND — An autonomous AI background process (e.g., Mighty Mac QA).
 *                 Has no human user context. Must still include tenantId.
 *
 * Rules:
 * - AI actors must never bypass tenant isolation.
 * - System-triggered actions on tenant-scoped data must include tenantId.
 * - No DB User, session, or membership row is created for AI actors.
 */
export type ActorType =
  | "USER"
  | "SYSTEM"
  | "AI_ASSISTANT"
  | "AI_BACKGROUND";

/**
 * What caused this action to be initiated.
 *
 * USER_TRIGGERED    — A human user performed a direct action.
 * SYSTEM_TRIGGERED  — The platform triggered this action automatically.
 * SCHEDULED         — A cron/scheduled job triggered this action.
 * WEBHOOK           — An inbound webhook triggered this action.
 */
export type TriggerType =
  | "USER_TRIGGERED"
  | "SYSTEM_TRIGGERED"
  | "SCHEDULED"
  | "WEBHOOK";

/**
 * The named system actor performing an AI or background action.
 *
 * MIGHTY_MAC — Background QA and neural observation AI. No user context.
 * MINI_MAC   — User-facing AI assistant. Retains invoking user's context.
 * PLATFORM   — Core MacTech platform automation (non-AI system actor).
 * UNKNOWN    — Actor could not be resolved. Use for defensive defaults only.
 *
 * These are stable identifiers. Do not rename after first use in telemetry/audit.
 */
export type SystemActor = "MIGHTY_MAC" | "MINI_MAC" | "PLATFORM" | "UNKNOWN";

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
 * The canonical typed context attached to every authenticated API request
 * or system-initiated action.
 *
 * This is constructed at the gateway layer from:
 * - The resolved MacTechAuthContext (internal user + tenant IDs)
 * - The parsed x-mactech-shadow-test header
 * - A generated requestId for traceability
 * - The resolved actor/trigger model
 *
 * Business logic must consume this context — never raw HTTP headers or
 * external provider IDs (Clerk IDs must not flow past the auth adapter).
 *
 * Security: roles and permissions are resolved server-side, never trusted
 * from the client.
 *
 * Actor model:
 * - Human user requests: actorType "USER", userId present.
 * - Mini Mac (user-invoked AI): actorType "AI_ASSISTANT", userId present (invoker's ID).
 * - Mighty Mac (background AI): actorType "AI_BACKGROUND", userId absent,
 *   systemActor "MIGHTY_MAC", tenantId still required.
 * - Platform jobs: actorType "SYSTEM", userId absent, systemActor "PLATFORM".
 */
export type RequestContext = {
  requestId: string;
  tenantId: string;
  userId?: string;
  actorType: ActorType;
  triggerType: TriggerType;
  systemActor?: SystemActor;
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

// ============================================================================
// FRCS CYBERSECURITY SCOPE CONTRACTS
// ============================================================================

export type FrcsCyberScopeLane =
  | "base_frcs_deliverable"
  | "adjacent_vendor_coordination"
  | "sitewide_cyber_pmo";

export type FrcsDeliverableKey =
  | "section_25_05_11_matrix"
  | "control_system_inventory"
  | "ports_protocols_services"
  | "interconnection_schedule"
  | "network_riser_review"
  | "stig_srg_applicability"
  | "vendor_data_calls"
  | "security_configuration_review"
  | "test_procedures"
  | "final_test_report"
  | "closeout_support"
  | "training_support";

export type FrcsCyberScopeProfile = {
  scopeLane: FrcsCyberScopeLane;
  baseDeliverables: FrcsDeliverableKey[];
  adjacentVendorCoordinationRequired?: boolean;
  sitewideCyberRequested?: boolean;
  optionalAddOns?: string[];
  governanceReadinessRef?: string;
  financePricingVersionRef?: string;
  evidenceRefs?: string[];
  boundaryStatement: string;
};

// ============================================================================
// SUITE WORKFLOW CONTRACTS
// ============================================================================

export type SuiteAppKey =
  | "hub"
  | "capture"
  | "governance"
  | "proposal"
  | "finance"
  | "contracts"
  | "qms"
  | "training"
  | "codex_vault";

export type SuiteWorkflowTemplateKey =
  | "prime_federal_rfp"
  | "subcontract_rfq"
  | "quick_commercial_quote"
  | "grant_sbir_sttr"
  | "idiq_vehicle"
  | "idiq_task_order"
  | "sole_source_sdvosb"
  | "teaming_mentor_protege"
  | "cui_cmmc_codex"
  | "iso_qms_compliance"
  | "classified_cleared_support";

export type SuiteWorkflowGateKey =
  | "intake_completeness"
  | "eligibility_readiness"
  | "bid_no_bid"
  | "technical_feasibility"
  | "finance_readiness"
  | "proposal_package_readiness"
  | "executive_approval"
  | "submission_receipt_capture"
  | "award_loss_outcome"
  | "post_award_handoff"
  | "closeout_retention";

export type SuiteWorkflowHealth =
  | "healthy"
  | "watch"
  | "blocked"
  | "waived"
  | "late"
  | "submitted"
  | "won"
  | "lost"
  | "postaward"
  | "closed";

export type SuiteHandoffStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "blocked"
  | "waived"
  | "sent"
  | "accepted"
  | "rejected"
  | "superseded";

export type SuiteHandoffType =
  | "capture_to_governance_screen"
  | "capture_to_proposal_kickoff"
  | "governance_to_bid_no_bid"
  | "governance_to_proposal_guidance"
  | "capture_to_finance_pricing_request"
  | "governance_to_finance_preaward"
  | "proposal_to_finance_pricing_request"
  | "finance_to_proposal_approved_volume"
  | "finance_to_governance_approved_quote"
  | "finance_to_governance_award_loss"
  | "proposal_to_governance_award_loss"
  | "proposal_to_finance_preaward"
  | "proposal_to_contracts_award_handoff"
  | "finance_to_contracts_award_handoff"
  | "governance_to_contracts_award_package"
  | "contracts_to_governance_obligation_baseline"
  | "contracts_to_finance_work_authorization"
  | "finance_to_contracts_invoice_reference"
  | "contracts_to_governance_closeout_record"
  | "award_to_governance_contract"
  | "award_to_finance_setup"
  | "award_to_qms_workspace"
  | "award_to_training_plan"
  | "award_to_codex_vault_workspace";

export type SuiteApproverKey = "brian_macdonald" | "patrick_caruso" | "james_adams";

export type SuiteAIProvenance = {
  sourceDocument: string;
  sourceTextReference: string;
  confidence: number;
  modelOrTool: string;
  humanReviewer: string | null;
  approvalStatus: "draft" | "needs_review" | "reviewed" | "rejected";
  finalVersionSnapshot: string | null;
};

export type SuiteWorkflowHandoffPacket = {
  suiteObjectReferenceId: string;
  workflowInstanceId: string;
  sourceApp: SuiteAppKey;
  targetApp: SuiteAppKey;
  sourceRecordId: string;
  sourceSnapshotId: string;
  handoffType: SuiteHandoffType;
  handoffStatus: SuiteHandoffStatus;
  requiredApprovals: SuiteApproverKey[];
  blockingDependencies: string[];
  AIProvenance: SuiteAIProvenance[];
  auditEvents: string[];
};

export type SuiteWorkflowDashboardStatus = {
  workflowInstanceId: string;
  suiteObjectReferenceId: string;
  templateKey: SuiteWorkflowTemplateKey;
  currentOwnerApp: SuiteAppKey;
  health: SuiteWorkflowHealth;
  currentGate: SuiteWorkflowGateKey;
  openBlockingDependencies: string[];
  requiredApprovals: SuiteApproverKey[];
  nextDueAt: string | null;
  lastEventType: string;
  lastEventAt: string;
};

export type SuiteWorkflowGateStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "completed"
  | "waived"
  | "not_required";

export type SuiteWorkflowOutcome = "open" | "submitted" | "won" | "lost" | "postaward" | "closed";

export type SuiteWorkflowIndicator =
  | "fci"
  | "cui"
  | "cdi"
  | "dfars_cyber"
  | "cmmc"
  | "sprs"
  | "dd254"
  | "classified_work"
  | "cleared_personnel"
  | "secure_enclave"
  | "quality_heavy"
  | "major_infrastructure"
  | "low_margin_high_risk"
  | "insurance_bonding_gap";

export type SuiteWorkflowApprovalState = {
  approver: SuiteApproverKey;
  status: "required" | "approved" | "rejected";
  decidedAt: string | null;
  decisionBy: string | null;
  actorType: "human" | "ai" | "system";
};

export type SuiteWorkflowWaiver = {
  reason: string;
  approver: SuiteApproverKey;
  approvedAt: string;
  linkedRiskRecordId: string;
  actorType: "human" | "ai" | "system";
};

export type SuiteWorkflowGateState = {
  key: SuiteWorkflowGateKey;
  ownerApp: SuiteAppKey;
  owner: SuiteApproverKey;
  approver: SuiteApproverKey;
  required: boolean;
  hardTriggers?: string[];
  status: SuiteWorkflowGateStatus;
  requiredApprovers: SuiteApproverKey[];
  approvals: SuiteWorkflowApprovalState[];
  blockingDependencies: string[];
  dueAt: string | null;
  completedAt: string | null;
  waiver: SuiteWorkflowWaiver | null;
};

export type SuiteWorkflowInstanceReadModel = {
  workflowInstanceId: string;
  suiteObjectReferenceId: string;
  templateKey: SuiteWorkflowTemplateKey;
  indicators: SuiteWorkflowIndicator[];
  gates: SuiteWorkflowGateState[];
  outcome: SuiteWorkflowOutcome;
  lastEventType: string;
  lastEventAt: string;
};
