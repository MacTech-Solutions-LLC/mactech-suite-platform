export const SUITE_WORKFLOW_CONTRACT_VERSION = "suite-workflow-contract-vnext";

export const SUITE_APP_AUTHORITIES = {
  hub: "Users, organizations, roles, app access, entitlements, suite object graph, workflow coordination, and cross-app references.",
  capture: "Opportunity discovery, solicitation intake, and Capture Package generation.",
  governance: "Compliance, risk, readiness, clauses, flowdowns, contract truth, waivers, and retention posture.",
  proposal: "Proposal execution, volumes, reviews, submission package, and award/loss handoff.",
  finance: "Pricing math, rates, BOE, scenarios, price volume, Green Team approval, timekeeping, actual accounting, QuickBooks, invoicing, payments, charge codes, and financial actuals.",
  qms: "Controlled documents, templates, SOPs, and quality records.",
  training: "Training requirements, assignments, completions, and evidence.",
  codex_vault: "CUI/CMMC evidence, cyber posture, SSP/POA&M, assessor evidence, and sensitive evidence storage.",
} as const;

export type SuiteAppKey = keyof typeof SUITE_APP_AUTHORITIES;

export const WORKFLOW_TEMPLATE_KEYS = [
  "prime_federal_rfp",
  "subcontract_rfq",
  "quick_commercial_quote",
  "grant_sbir_sttr",
  "idiq_vehicle",
  "idiq_task_order",
  "sole_source_sdvosb",
  "teaming_mentor_protege",
  "cui_cmmc_codex",
  "iso_qms_compliance",
  "classified_cleared_support",
] as const;

export type SuiteWorkflowTemplateKey = (typeof WORKFLOW_TEMPLATE_KEYS)[number];

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

export type SuiteApproverKey = "brian_macdonald" | "patrick_caruso" | "james_adams";

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
  | "proposal_to_finance_pricing_request"
  | "finance_to_proposal_approved_volume"
  | "proposal_to_governance_award_loss"
  | "proposal_to_finance_preaward"
  | "award_to_governance_contract"
  | "award_to_finance_setup"
  | "award_to_qms_workspace"
  | "award_to_training_plan"
  | "award_to_codex_vault_workspace";

export type AIProvenance = {
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
  AIProvenance: AIProvenance[];
  auditEvents: string[];
};

export type SuiteWorkflowDashboardLane =
  | "active_pursuits"
  | "bid_no_bid_queue"
  | "finance_pricing_reviews"
  | "proposal_deadlines"
  | "governance_blockers"
  | "finance_setup_blockers"
  | "cyber_security_blockers"
  | "executive_approvals"
  | "award_loss_outcomes";

export type SuiteWorkflowGate = {
  key: SuiteWorkflowGateKey;
  ownerApp: SuiteAppKey;
  owner: SuiteApproverKey;
  approver: SuiteApproverKey;
  required: boolean;
  hardTriggers?: string[];
};

export type SuiteWorkflowTemplate = {
  key: SuiteWorkflowTemplateKey;
  label: string;
  primaryOwningApp: SuiteAppKey;
  routeApps: SuiteAppKey[];
  defaultGates: SuiteWorkflowGate[];
  requiredHandoffTypes: SuiteHandoffType[];
  dashboardLanes: SuiteWorkflowDashboardLane[];
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

const MINIMUM_GATE_KEYS: SuiteWorkflowGateKey[] = [
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
];

const CYBER_HARD_TRIGGERS = [
  "FCI",
  "CUI",
  "CDI",
  "DFARS cyber clause",
  "CMMC",
  "SPRS",
  "DD254",
  "classified work",
  "cleared personnel",
  "secure enclave",
];

export const SUITE_WORKFLOW_TEMPLATES: Record<SuiteWorkflowTemplateKey, SuiteWorkflowTemplate> = {
  prime_federal_rfp: template("prime_federal_rfp", "Prime federal RFP", "capture", [
    "capture",
    "governance",
    "proposal",
    "finance",
    "finance",
  ]),
  subcontract_rfq: template("subcontract_rfq", "Subcontractor RFQ/RFP", "capture", [
    "capture",
    "governance",
    "finance",
    "proposal",
    "finance",
  ]),
  quick_commercial_quote: template("quick_commercial_quote", "Quick commercial quote", "finance", [
    "capture",
    "governance",
    "finance",
    "finance",
  ]),
  grant_sbir_sttr: template("grant_sbir_sttr", "Grant/SBIR/STTR", "capture", [
    "capture",
    "governance",
    "proposal",
    "finance",
  ]),
  idiq_vehicle: template("idiq_vehicle", "IDIQ vehicle", "capture", [
    "capture",
    "governance",
    "proposal",
    "finance",
    "finance",
  ]),
  idiq_task_order: template("idiq_task_order", "IDIQ task order", "capture", [
    "capture",
    "governance",
    "proposal",
    "finance",
    "finance",
  ]),
  sole_source_sdvosb: template("sole_source_sdvosb", "Sole-source/SDVOSB directed opportunity", "capture", [
    "capture",
    "governance",
    "proposal",
    "finance",
    "finance",
  ]),
  teaming_mentor_protege: template("teaming_mentor_protege", "Teaming/mentor-protege opportunity", "capture", [
    "capture",
    "governance",
    "proposal",
    "finance",
  ]),
  cui_cmmc_codex: template("cui_cmmc_codex", "CUI/CMMC/Codex opportunity", "governance", [
    "capture",
    "governance",
    "codex_vault",
    "proposal",
    "finance",
    "training",
  ]),
  iso_qms_compliance: template("iso_qms_compliance", "ISO/QMS/pharma/compliance opportunity", "governance", [
    "capture",
    "governance",
    "qms",
    "proposal",
    "finance",
    "training",
  ]),
  classified_cleared_support: template("classified_cleared_support", "Classified/cleared support opportunity", "governance", [
    "capture",
    "governance",
    "codex_vault",
    "proposal",
    "finance",
    "finance",
  ]),
};

export const CROSS_APP_WORKFLOW_MAP: Record<SuiteWorkflowTemplateKey, SuiteAppKey[]> = Object.fromEntries(
  WORKFLOW_TEMPLATE_KEYS.map((key) => [key, SUITE_WORKFLOW_TEMPLATES[key].routeApps]),
) as Record<SuiteWorkflowTemplateKey, SuiteAppKey[]>;

export function getWorkflowTemplate(key: SuiteWorkflowTemplateKey): SuiteWorkflowTemplate {
  return SUITE_WORKFLOW_TEMPLATES[key];
}

export function workflowTemplateRequiresPatrickReview(key: SuiteWorkflowTemplateKey): boolean {
  return getWorkflowTemplate(key).defaultGates.some((gate) => gate.approver === "patrick_caruso" && gate.required);
}

export function validateHandoffPacket(packet: SuiteWorkflowHandoffPacket): string[] {
  const errors: string[] = [];
  if (!packet.suiteObjectReferenceId) errors.push("suiteObjectReferenceId is required.");
  if (!packet.workflowInstanceId) errors.push("workflowInstanceId is required.");
  if (!packet.sourceRecordId) errors.push("sourceRecordId is required.");
  if (!packet.sourceSnapshotId) errors.push("sourceSnapshotId is required.");
  if (!packet.handoffType) errors.push("handoffType is required.");
  if (!packet.handoffStatus) errors.push("handoffStatus is required.");
  if (!Array.isArray(packet.requiredApprovals)) errors.push("requiredApprovals must be an array.");
  if (!Array.isArray(packet.blockingDependencies)) errors.push("blockingDependencies must be an array.");
  if (!Array.isArray(packet.AIProvenance)) errors.push("AIProvenance must be an array.");
  if (!Array.isArray(packet.auditEvents) || packet.auditEvents.length === 0) {
    errors.push("auditEvents must include at least one Hub event id or event type.");
  }
  if (packet.sourceApp === packet.targetApp) errors.push("sourceApp and targetApp must differ for a cross-app handoff.");
  if (packet.handoffStatus === "waived" && packet.requiredApprovals.length === 0) {
    errors.push("waived handoffs require an approver reference.");
  }
  return errors;
}

function template(
  key: SuiteWorkflowTemplateKey,
  label: string,
  primaryOwningApp: SuiteAppKey,
  routeApps: SuiteAppKey[],
): SuiteWorkflowTemplate {
  const defaultGates = MINIMUM_GATE_KEYS.map((gateKey) => {
    const baseGate: SuiteWorkflowGate = {
      key: gateKey,
      ownerApp: ownerAppForGate(gateKey),
      owner: ownerForGate(gateKey),
      approver: approverForGate(gateKey),
      required: true,
    };

    if (key === "cui_cmmc_codex" || key === "classified_cleared_support") {
      if (gateKey === "eligibility_readiness" || gateKey === "bid_no_bid" || gateKey === "proposal_package_readiness") {
        return { ...baseGate, ownerApp: "governance" as const, approver: "patrick_caruso" as const, hardTriggers: CYBER_HARD_TRIGGERS };
      }
    }
    if (key === "iso_qms_compliance" && (gateKey === "eligibility_readiness" || gateKey === "technical_feasibility")) {
      return { ...baseGate, ownerApp: "qms" as const, approver: "james_adams" as const };
    }
    return baseGate;
  });

  return {
    key,
    label,
    primaryOwningApp,
    routeApps: Array.from(new Set(routeApps)),
    defaultGates,
    requiredHandoffTypes: handoffsForRoute(routeApps),
    dashboardLanes: dashboardLanesForRoute(routeApps),
  };
}

function ownerAppForGate(key: SuiteWorkflowGateKey): SuiteAppKey {
  switch (key) {
    case "intake_completeness":
      return "capture";
    case "eligibility_readiness":
    case "bid_no_bid":
    case "technical_feasibility":
      return "governance";
    case "finance_readiness":
      return "finance";
    case "proposal_package_readiness":
    case "submission_receipt_capture":
    case "award_loss_outcome":
      return "proposal";
    case "executive_approval":
      return "hub";
    case "post_award_handoff":
    case "closeout_retention":
      return "governance";
  }
}

function ownerForGate(key: SuiteWorkflowGateKey): SuiteApproverKey {
  return key === "finance_readiness" || key === "executive_approval" ? "brian_macdonald" : approverForGate(key);
}

function approverForGate(key: SuiteWorkflowGateKey): SuiteApproverKey {
  switch (key) {
    case "technical_feasibility":
    case "post_award_handoff":
      return "james_adams";
    default:
      return "brian_macdonald";
  }
}

function handoffsForRoute(routeApps: SuiteAppKey[]): SuiteHandoffType[] {
  const handoffs: SuiteHandoffType[] = ["capture_to_governance_screen", "governance_to_bid_no_bid"];
  if (routeApps.includes("proposal")) handoffs.push("capture_to_proposal_kickoff", "governance_to_proposal_guidance");
  if (routeApps.includes("finance")) handoffs.push("proposal_to_finance_pricing_request", "finance_to_proposal_approved_volume");
  if (routeApps.includes("finance")) handoffs.push("proposal_to_finance_preaward", "award_to_finance_setup");
  if (routeApps.includes("qms")) handoffs.push("award_to_qms_workspace");
  if (routeApps.includes("training")) handoffs.push("award_to_training_plan");
  if (routeApps.includes("codex_vault")) handoffs.push("award_to_codex_vault_workspace");
  handoffs.push("proposal_to_governance_award_loss", "award_to_governance_contract");
  return Array.from(new Set(handoffs));
}

function dashboardLanesForRoute(routeApps: SuiteAppKey[]): SuiteWorkflowDashboardLane[] {
  const lanes: SuiteWorkflowDashboardLane[] = [
    "active_pursuits",
    "bid_no_bid_queue",
    "governance_blockers",
    "executive_approvals",
    "award_loss_outcomes",
  ];
  if (routeApps.includes("proposal")) lanes.push("proposal_deadlines");
  if (routeApps.includes("finance")) lanes.push("finance_pricing_reviews");
  if (routeApps.includes("finance")) lanes.push("finance_setup_blockers");
  if (routeApps.includes("codex_vault")) lanes.push("cyber_security_blockers");
  return Array.from(new Set(lanes));
}
