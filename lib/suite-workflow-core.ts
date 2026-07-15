export const SUITE_WORKFLOW_CONTRACT_VERSION = "suite-workflow-contract-vnext.2";

export const SUITE_APP_AUTHORITIES = {
  hub: "Users, organizations, roles, app access, entitlements, suite object graph, workflow coordination, and cross-app references.",
  capture: "Opportunity discovery, solicitation intake, and Capture Package generation.",
  governance: "Compliance, risk, readiness, clauses, flowdowns, contract truth, waivers, and retention posture.",
  proposal: "Proposal execution, volumes, reviews, submission package, and award/loss handoff.",
  pricing: "Pricing math, rates, BOE, scenarios, price volume, cost realism, and Green Team approval.",
  finance: "Actual accounting, QuickBooks, invoicing, payments, charge codes, financial actuals, and reconciliation.",
  contracts: "Awarded contract lifecycle, CLINs, modifications, periods of performance, work authorizations, deliverables, CPARS, and closeout execution.",
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
  | "pricing_finance_readiness"
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
  | "capture_to_pricing_request"
  | "governance_to_finance_preaward"
  | "proposal_to_pricing_request"
  | "pricing_to_proposal_approved_volume"
  | "pricing_to_governance_approved_quote"
  | "pricing_to_finance_award_assumptions"
  | "proposal_to_governance_award_loss"
  | "proposal_to_finance_preaward"
  | "proposal_to_contracts_award_handoff"
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
  | "pricing_reviews"
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

export type SuiteApprovalActorType = "human" | "ai" | "system";

export type SuiteWorkflowApprovalState = {
  approver: SuiteApproverKey;
  status: "required" | "approved" | "rejected";
  decidedAt: string | null;
  decisionBy: string | null;
  actorType: SuiteApprovalActorType;
};

export type SuiteWorkflowWaiver = {
  reason: string;
  approver: SuiteApproverKey;
  approvedAt: string;
  linkedRiskRecordId: string;
  actorType: SuiteApprovalActorType;
};

export type SuiteWorkflowGateState = SuiteWorkflowGate & {
  status: SuiteWorkflowGateStatus;
  requiredApprovers: SuiteApproverKey[];
  approvals: SuiteWorkflowApprovalState[];
  blockingDependencies: string[];
  dueAt: string | null;
  completedAt: string | null;
  waiver: SuiteWorkflowWaiver | null;
};

export type SuiteWorkflowGateObservation = {
  key: SuiteWorkflowGateKey;
  status: SuiteWorkflowGateStatus;
  approvals?: SuiteWorkflowApprovalState[];
  blockingDependencies?: string[];
  dueAt?: string | null;
  completedAt?: string | null;
  waiver?: SuiteWorkflowWaiver | null;
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

export type BuildSuiteWorkflowReadModelInput = {
  workflowInstanceId: string;
  suiteObjectReferenceId: string;
  templateKey: SuiteWorkflowTemplateKey;
  indicators?: SuiteWorkflowIndicator[];
  gateObservations?: SuiteWorkflowGateObservation[];
  outcome?: SuiteWorkflowOutcome;
  lastEventType: string;
  lastEventAt: string;
};

const MINIMUM_GATE_KEYS: SuiteWorkflowGateKey[] = [
  "intake_completeness",
  "eligibility_readiness",
  "bid_no_bid",
  "technical_feasibility",
  "pricing_finance_readiness",
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

const CYBER_INDICATORS: SuiteWorkflowIndicator[] = [
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
];

export const SUITE_WORKFLOW_TEMPLATES: Record<SuiteWorkflowTemplateKey, SuiteWorkflowTemplate> = {
  prime_federal_rfp: template("prime_federal_rfp", "Prime federal RFP", "capture", [
    "capture",
    "governance",
    "proposal",
    "pricing",
    "finance",
    "contracts",
  ]),
  subcontract_rfq: template("subcontract_rfq", "Subcontractor RFQ/RFP", "capture", [
    "capture",
    "governance",
    "proposal",
    "pricing",
    "finance",
    "contracts",
  ]),
  quick_commercial_quote: template("quick_commercial_quote", "Quick commercial quote", "pricing", [
    "capture",
    "governance",
    "proposal",
    "pricing",
    "finance",
    "contracts",
  ]),
  grant_sbir_sttr: template("grant_sbir_sttr", "Grant/SBIR/STTR", "capture", [
    "capture",
    "governance",
    "proposal",
    "pricing",
    "finance",
    "contracts",
  ]),
  idiq_vehicle: template("idiq_vehicle", "IDIQ vehicle", "capture", [
    "capture",
    "governance",
    "proposal",
    "pricing",
    "finance",
    "contracts",
  ]),
  idiq_task_order: template("idiq_task_order", "IDIQ task order", "capture", [
    "capture",
    "governance",
    "proposal",
    "pricing",
    "finance",
    "contracts",
  ]),
  sole_source_sdvosb: template("sole_source_sdvosb", "Sole-source/SDVOSB directed opportunity", "capture", [
    "capture",
    "governance",
    "proposal",
    "pricing",
    "finance",
    "contracts",
  ]),
  teaming_mentor_protege: template("teaming_mentor_protege", "Teaming/mentor-protege opportunity", "capture", [
    "capture",
    "governance",
    "proposal",
    "pricing",
    "finance",
    "contracts",
  ]),
  cui_cmmc_codex: template("cui_cmmc_codex", "CUI/CMMC/Codex opportunity", "governance", [
    "capture",
    "governance",
    "codex_vault",
    "proposal",
    "pricing",
    "finance",
    "contracts",
    "training",
  ]),
  iso_qms_compliance: template("iso_qms_compliance", "ISO/QMS/pharma/compliance opportunity", "governance", [
    "capture",
    "governance",
    "qms",
    "proposal",
    "pricing",
    "finance",
    "contracts",
    "training",
  ]),
  classified_cleared_support: template("classified_cleared_support", "Classified/cleared support opportunity", "governance", [
    "capture",
    "governance",
    "codex_vault",
    "proposal",
    "pricing",
    "finance",
    "contracts",
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

export function buildSuiteWorkflowReadModel(
  input: BuildSuiteWorkflowReadModelInput,
): SuiteWorkflowInstanceReadModel {
  const templateDefinition = getWorkflowTemplate(input.templateKey);
  const indicators = Array.from(new Set(input.indicators ?? []));
  const observations = new Map((input.gateObservations ?? []).map((observation) => [observation.key, observation]));

  const gates = templateDefinition.defaultGates.map((gate) => {
    const observation = observations.get(gate.key);
    const requiredApprovers = requiredApproversForGate(input.templateKey, gate.key, indicators);
    const approvals = requiredApprovers.map((approver) => {
      const observed = observation?.approvals?.find((approval) => approval.approver === approver);
      return observed ?? {
        approver,
        status: "required" as const,
        decidedAt: null,
        decisionBy: null,
        actorType: "human" as const,
      };
    });

    return {
      ...gate,
      status: observation?.status ?? "pending",
      requiredApprovers,
      approvals,
      blockingDependencies: Array.from(new Set(observation?.blockingDependencies ?? [])),
      dueAt: observation?.dueAt ?? null,
      completedAt: observation?.completedAt ?? null,
      waiver: observation?.waiver ?? null,
    } satisfies SuiteWorkflowGateState;
  });

  return {
    workflowInstanceId: input.workflowInstanceId,
    suiteObjectReferenceId: input.suiteObjectReferenceId,
    templateKey: input.templateKey,
    indicators,
    gates,
    outcome: input.outcome ?? "open",
    lastEventType: input.lastEventType,
    lastEventAt: input.lastEventAt,
  };
}

export function requiredApproversForGate(
  templateKey: SuiteWorkflowTemplateKey,
  gateKey: SuiteWorkflowGateKey,
  indicators: SuiteWorkflowIndicator[] = [],
): SuiteApproverKey[] {
  const gate = getWorkflowTemplate(templateKey).defaultGates.find((candidate) => candidate.key === gateKey);
  if (!gate) return [];

  const approvers: SuiteApproverKey[] = [gate.approver];
  const cyberTriggered =
    templateKey === "cui_cmmc_codex" ||
    templateKey === "classified_cleared_support" ||
    indicators.some((indicator) => CYBER_INDICATORS.includes(indicator));

  if (cyberTriggered && ["eligibility_readiness", "bid_no_bid", "proposal_package_readiness"].includes(gateKey)) {
    approvers.push("patrick_caruso", "brian_macdonald");
  }

  const qualityTriggered =
    templateKey === "iso_qms_compliance" ||
    indicators.includes("quality_heavy") ||
    indicators.includes("major_infrastructure");
  if (qualityTriggered && ["technical_feasibility", "proposal_package_readiness"].includes(gateKey)) {
    approvers.push("james_adams", "brian_macdonald");
  }

  if (
    gateKey === "executive_approval" &&
    (indicators.includes("low_margin_high_risk") || indicators.includes("insurance_bonding_gap"))
  ) {
    approvers.push("brian_macdonald");
  }

  return Array.from(new Set(approvers));
}

export function validateWorkflowGateState(gate: SuiteWorkflowGateState): string[] {
  const errors: string[] = [];
  const approvalsByApprover = new Map(gate.approvals.map((approval) => [approval.approver, approval]));

  for (const requiredApprover of gate.requiredApprovers) {
    if (!approvalsByApprover.has(requiredApprover)) {
      errors.push(`${gate.key} is missing approval state for ${requiredApprover}.`);
    }
  }

  for (const approval of gate.approvals) {
    if (approval.actorType === "ai" && approval.status !== "required") {
      errors.push(`AI may not approve or reject ${gate.key}.`);
    }
    if (approval.status !== "required" && (!approval.decidedAt || !approval.decisionBy)) {
      errors.push(`${gate.key} approval decisions require decidedAt and decisionBy.`);
    }
  }

  if (gate.required && gate.status === "not_required") {
    errors.push(`${gate.key} is required and cannot be marked not_required.`);
  }

  if (gate.status === "completed") {
    if (gate.blockingDependencies.length > 0) {
      errors.push(`${gate.key} cannot complete while blocking dependencies remain open.`);
    }
    for (const requiredApprover of gate.requiredApprovers) {
      if (approvalsByApprover.get(requiredApprover)?.status !== "approved") {
        errors.push(`${gate.key} requires ${requiredApprover} approval before completion.`);
      }
    }
    if (!gate.completedAt) errors.push(`${gate.key} completion requires completedAt.`);
  }

  if (gate.status === "waived") {
    if (!gate.waiver?.reason.trim()) errors.push(`${gate.key} waiver requires a reason.`);
    if (!gate.waiver?.approvedAt) errors.push(`${gate.key} waiver requires an approval timestamp.`);
    if (!gate.waiver?.linkedRiskRecordId.trim()) errors.push(`${gate.key} waiver requires a linked risk record.`);
    if (gate.waiver?.actorType === "ai") errors.push(`AI may not waive ${gate.key}.`);
    if (gate.waiver && !gate.requiredApprovers.includes(gate.waiver.approver)) {
      errors.push(`${gate.key} waiver approver must be one of the required human approvers.`);
    }
    if (!gate.completedAt) errors.push(`${gate.key} waiver requires completedAt.`);
  } else if (gate.waiver) {
    errors.push(`${gate.key} includes waiver metadata but is not in waived status.`);
  }

  return errors;
}

export function validateSuiteWorkflowReadModel(instance: SuiteWorkflowInstanceReadModel): string[] {
  const errors = instance.gates.flatMap(validateWorkflowGateState);
  const gateKeys = instance.gates.map((gate) => gate.key);
  for (const requiredGate of MINIMUM_GATE_KEYS) {
    if (!gateKeys.includes(requiredGate)) errors.push(`Workflow is missing required gate ${requiredGate}.`);
  }
  return errors;
}

export function deriveWorkflowDashboardStatus(
  instance: SuiteWorkflowInstanceReadModel,
  now = new Date(),
): SuiteWorkflowDashboardStatus {
  const openGates = instance.gates.filter((gate) => !isResolvedGateStatus(gate.status));
  const currentGate = openGates[0] ?? instance.gates[instance.gates.length - 1];
  const openBlockingDependencies = Array.from(
    new Set(instance.gates.flatMap((gate) => gate.blockingDependencies)),
  );
  const requiredApprovals = currentGate
    ? currentGate.requiredApprovers.filter(
        (approver) => currentGate.approvals.find((approval) => approval.approver === approver)?.status !== "approved",
      )
    : [];

  return {
    workflowInstanceId: instance.workflowInstanceId,
    suiteObjectReferenceId: instance.suiteObjectReferenceId,
    templateKey: instance.templateKey,
    currentOwnerApp: currentGate?.ownerApp ?? getWorkflowTemplate(instance.templateKey).primaryOwningApp,
    health: deriveWorkflowHealth(instance, now),
    currentGate: currentGate?.key ?? "closeout_retention",
    openBlockingDependencies,
    requiredApprovals,
    nextDueAt: currentGate?.dueAt ?? null,
    lastEventType: instance.lastEventType,
    lastEventAt: instance.lastEventAt,
  };
}

function deriveWorkflowHealth(instance: SuiteWorkflowInstanceReadModel, now: Date): SuiteWorkflowHealth {
  if (instance.outcome !== "open") return instance.outcome;
  if (instance.gates.some((gate) => gate.status === "blocked" || gate.blockingDependencies.length > 0)) {
    return "blocked";
  }
  if (
    instance.gates.some(
      (gate) => !isResolvedGateStatus(gate.status) && gate.dueAt && new Date(gate.dueAt).getTime() < now.getTime(),
    )
  ) {
    return "late";
  }
  if (instance.gates.some((gate) => gate.status === "waived")) return "waived";
  if (instance.gates.some((gate) => gate.status === "in_progress")) return "watch";
  return "healthy";
}

function isResolvedGateStatus(status: SuiteWorkflowGateStatus): boolean {
  return status === "completed" || status === "waived" || status === "not_required";
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
    case "pricing_finance_readiness":
      return "pricing";
    case "proposal_package_readiness":
    case "submission_receipt_capture":
    case "award_loss_outcome":
      return "proposal";
    case "executive_approval":
      return "hub";
    case "post_award_handoff":
    case "closeout_retention":
      return "contracts";
  }
}

function ownerForGate(key: SuiteWorkflowGateKey): SuiteApproverKey {
  return key === "pricing_finance_readiness" || key === "executive_approval" ? "brian_macdonald" : approverForGate(key);
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
  if (routeApps.includes("pricing")) {
    handoffs.push(
      routeApps.includes("proposal") ? "proposal_to_pricing_request" : "capture_to_pricing_request",
      routeApps.includes("proposal") ? "pricing_to_proposal_approved_volume" : "pricing_to_governance_approved_quote",
    );
  }
  if (routeApps.includes("finance")) {
    handoffs.push(
      routeApps.includes("proposal") ? "proposal_to_finance_preaward" : "governance_to_finance_preaward",
      "award_to_finance_setup",
    );
    if (routeApps.includes("pricing")) handoffs.push("pricing_to_finance_award_assumptions");
  }
  if (routeApps.includes("proposal")) {
    handoffs.push("proposal_to_governance_award_loss");
  }
  if (routeApps.includes("contracts")) {
    handoffs.push(
      "proposal_to_contracts_award_handoff",
      "governance_to_contracts_award_package",
      "contracts_to_governance_obligation_baseline",
      "contracts_to_finance_work_authorization",
      "finance_to_contracts_invoice_reference",
      "contracts_to_governance_closeout_record",
    );
  }
  if (routeApps.includes("qms")) handoffs.push("award_to_qms_workspace");
  if (routeApps.includes("training")) handoffs.push("award_to_training_plan");
  if (routeApps.includes("codex_vault")) handoffs.push("award_to_codex_vault_workspace");
  handoffs.push("award_to_governance_contract");
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
  if (routeApps.includes("pricing")) lanes.push("pricing_reviews");
  if (routeApps.includes("finance")) lanes.push("finance_setup_blockers");
  if (routeApps.includes("codex_vault")) lanes.push("cyber_security_blockers");
  return Array.from(new Set(lanes));
}
