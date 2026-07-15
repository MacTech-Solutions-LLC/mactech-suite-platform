import { z } from "zod";
import { WORKFLOW_TEMPLATE_KEYS } from "@/lib/suite-workflow-core";

export const suiteAppKeySchema = z.enum([
  "hub",
  "capture",
  "governance",
  "proposal",
  "finance",
  "contracts",
  "qms",
  "training",
  "codex_vault",
]);

export const suiteWorkflowGateKeySchema = z.enum([
  "intake_completeness",
  "eligibility_readiness",
  "bid_no_bid",
  "technical_feasibility",
  "finance_readiness",
  "proposal_package_readiness",
  "executive_approval",
  "submission_receipt_capture",
  "award_loss_outcome",
  "post_award_handoff",
  "closeout_retention",
]);

export const suiteApproverKeySchema = z.enum(["brian_macdonald", "patrick_caruso", "james_adams"]);

export const suiteHandoffTypeSchema = z.enum([
  "capture_to_governance_screen",
  "capture_to_proposal_kickoff",
  "governance_to_bid_no_bid",
  "governance_to_proposal_guidance",
  "capture_to_finance_pricing_request",
  "governance_to_finance_preaward",
  "proposal_to_finance_pricing_request",
  "finance_to_proposal_approved_volume",
  "finance_to_governance_approved_quote",
  "finance_to_governance_award_loss",
  "proposal_to_governance_award_loss",
  "proposal_to_finance_preaward",
  "proposal_to_contracts_award_handoff",
  "finance_to_contracts_award_handoff",
  "governance_to_contracts_award_package",
  "contracts_to_governance_obligation_baseline",
  "contracts_to_finance_work_authorization",
  "finance_to_contracts_invoice_reference",
  "contracts_to_governance_closeout_record",
  "award_to_governance_contract",
  "award_to_finance_setup",
  "award_to_qms_workspace",
  "award_to_training_plan",
  "award_to_codex_vault_workspace",
]);

export const suiteHandoffStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "blocked",
  "waived",
  "sent",
  "accepted",
  "rejected",
  "superseded",
]);

export const suiteWorkflowHealthSchema = z.enum([
  "healthy",
  "watch",
  "blocked",
  "waived",
  "late",
  "submitted",
  "won",
  "lost",
  "postaward",
  "closed",
]);

export const suiteWorkflowGateStatusSchema = z.enum([
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "waived",
  "not_required",
]);

export const suiteWorkflowOutcomeSchema = z.enum(["open", "submitted", "won", "lost", "postaward", "closed"]);

export const suiteWorkflowIndicatorSchema = z.enum([
  "fci",
  "cui",
  "cdi",
  "dfars_cyber",
  "cmmc",
  "sprs",
  "dd254",
  "classified_work",
  "cleared_personnel",
  "secure_enclave",
  "quality_heavy",
  "major_infrastructure",
  "low_margin_high_risk",
  "insurance_bonding_gap",
]);

export const suiteWorkflowApprovalStateSchema = z.object({
  approver: suiteApproverKeySchema,
  status: z.enum(["required", "approved", "rejected"]),
  decidedAt: z.string().datetime().nullable(),
  decisionBy: z.string().min(1).max(200).nullable(),
  actorType: z.enum(["human", "ai", "system"]),
});

export const suiteWorkflowWaiverSchema = z.object({
  reason: z.string().min(1).max(2000),
  approver: suiteApproverKeySchema,
  approvedAt: z.string().datetime(),
  linkedRiskRecordId: z.string().min(1).max(300),
  actorType: z.enum(["human", "ai", "system"]),
});

export const suiteAIProvenanceSchema = z.object({
  sourceDocument: z.string().min(1).max(500),
  sourceTextReference: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1),
  modelOrTool: z.string().min(1).max(200),
  humanReviewer: z.string().min(1).max(200).optional().nullable(),
  approvalStatus: z.enum(["draft", "needs_review", "reviewed", "rejected"]),
  finalVersionSnapshot: z.string().min(1).max(500).optional().nullable(),
});

export const suiteWorkflowHandoffPacketSchema = z.object({
  suiteObjectReferenceId: z.string().min(1).max(200),
  workflowInstanceId: z.string().min(1).max(200),
  sourceApp: suiteAppKeySchema,
  targetApp: suiteAppKeySchema,
  sourceRecordId: z.string().min(1).max(300),
  sourceSnapshotId: z.string().min(1).max(300),
  handoffType: suiteHandoffTypeSchema,
  handoffStatus: suiteHandoffStatusSchema,
  requiredApprovals: z.array(suiteApproverKeySchema),
  blockingDependencies: z.array(z.string().min(1).max(300)),
  AIProvenance: z.array(suiteAIProvenanceSchema),
  auditEvents: z.array(z.string().min(1).max(300)).min(1),
});

export const suiteWorkflowDashboardStatusSchema = z.object({
  workflowInstanceId: z.string().min(1).max(200),
  suiteObjectReferenceId: z.string().min(1).max(200),
  templateKey: z.enum(WORKFLOW_TEMPLATE_KEYS),
  currentOwnerApp: suiteAppKeySchema,
  health: suiteWorkflowHealthSchema,
  currentGate: suiteWorkflowGateKeySchema,
  openBlockingDependencies: z.array(z.string().min(1).max(300)),
  requiredApprovals: z.array(suiteApproverKeySchema),
  nextDueAt: z.string().datetime().optional().nullable(),
  lastEventType: z.string().min(1).max(300),
  lastEventAt: z.string().datetime(),
});

export const suiteWorkflowGateStateSchema = z.object({
  key: suiteWorkflowGateKeySchema,
  ownerApp: suiteAppKeySchema,
  owner: suiteApproverKeySchema,
  approver: suiteApproverKeySchema,
  required: z.boolean(),
  hardTriggers: z.array(z.string().min(1).max(300)).optional(),
  status: suiteWorkflowGateStatusSchema,
  requiredApprovers: z.array(suiteApproverKeySchema).min(1),
  approvals: z.array(suiteWorkflowApprovalStateSchema),
  blockingDependencies: z.array(z.string().min(1).max(300)),
  dueAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  waiver: suiteWorkflowWaiverSchema.nullable(),
});

export const suiteWorkflowInstanceReadModelSchema = z.object({
  workflowInstanceId: z.string().min(1).max(200),
  suiteObjectReferenceId: z.string().min(1).max(200),
  templateKey: z.enum(WORKFLOW_TEMPLATE_KEYS),
  indicators: z.array(suiteWorkflowIndicatorSchema),
  gates: z.array(suiteWorkflowGateStateSchema).min(1),
  outcome: suiteWorkflowOutcomeSchema,
  lastEventType: z.string().min(1).max(300),
  lastEventAt: z.string().datetime(),
});

export function validationIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
