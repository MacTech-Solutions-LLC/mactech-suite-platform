import { z } from "zod";
import { WORKFLOW_TEMPLATE_KEYS } from "@/lib/suite-workflow-core";

export const suiteAppKeySchema = z.enum([
  "hub",
  "capture",
  "governance",
  "proposal",
  "finance",
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
  "proposal_to_finance_pricing_request",
  "finance_to_proposal_approved_volume",
  "proposal_to_governance_award_loss",
  "proposal_to_finance_preaward",
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

export function validationIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
