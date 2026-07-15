import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSuiteWorkflowReadModel,
  CROSS_APP_WORKFLOW_MAP,
  deriveWorkflowDashboardStatus,
  getWorkflowTemplate,
  requiredApproversForGate,
  SUITE_WORKFLOW_TEMPLATES,
  validateHandoffPacket,
  validateSuiteWorkflowReadModel,
  workflowTemplateRequiresPatrickReview,
  WORKFLOW_TEMPLATE_KEYS,
  type SuiteWorkflowHandoffPacket,
} from "./suite-workflow-core";

test("every registered workflow template has the minimum Hub gates", () => {
  for (const key of WORKFLOW_TEMPLATE_KEYS) {
    const template = SUITE_WORKFLOW_TEMPLATES[key];
    assert.equal(template.defaultGates.length, 11, key);
    assert.equal(template.defaultGates.every((gate) => gate.owner && gate.approver), true, key);
    assert.equal(template.defaultGates.every((gate) => gate.required), true, key);
  }
});

test("cyber and classified workflow templates force Patrick review", () => {
  assert.equal(workflowTemplateRequiresPatrickReview("cui_cmmc_codex"), true);
  assert.equal(workflowTemplateRequiresPatrickReview("classified_cleared_support"), true);
  assert.equal(workflowTemplateRequiresPatrickReview("subcontract_rfq"), false);
});

test("workflow map keeps Hub as coordinator while apps retain route ownership", () => {
  assert.deepEqual(CROSS_APP_WORKFLOW_MAP.subcontract_rfq, [
    "capture",
    "governance",
    "proposal",
    "pricing",
    "finance",
    "contracts",
  ]);
  assert.equal(getWorkflowTemplate("quick_commercial_quote").primaryOwningApp, "pricing");
  assert.equal(getWorkflowTemplate("iso_qms_compliance").routeApps.includes("qms"), true);
});

test("standard handoff packet requires references, snapshot ids, provenance arrays, and audit events", () => {
  const packet: SuiteWorkflowHandoffPacket = {
    suiteObjectReferenceId: "sor_123",
    workflowInstanceId: "wf_123",
    sourceApp: "pricing",
    targetApp: "proposal",
    sourceRecordId: "price_123",
    sourceSnapshotId: "snap_123",
    handoffType: "pricing_to_proposal_approved_volume",
    handoffStatus: "approved",
    requiredApprovals: ["brian_macdonald"],
    blockingDependencies: [],
    AIProvenance: [],
    auditEvents: ["pricing.green_team.approved"],
  };

  assert.deepEqual(validateHandoffPacket(packet), []);
  assert.match(
    validateHandoffPacket({ ...packet, suiteObjectReferenceId: "", auditEvents: [] }).join(" "),
    /suiteObjectReferenceId is required/,
  );
  assert.match(
    validateHandoffPacket({ ...packet, sourceApp: "finance", targetApp: "finance" }).join(" "),
    /sourceApp and targetApp must differ/,
  );
});

test("runtime cyber indicators force Patrick and Brian review even on a non-cyber template", () => {
  assert.deepEqual(
    requiredApproversForGate("subcontract_rfq", "bid_no_bid", ["cui"]),
    ["brian_macdonald", "patrick_caruso"],
  );
  assert.deepEqual(
    requiredApproversForGate("subcontract_rfq", "proposal_package_readiness", ["dfars_cyber"]),
    ["brian_macdonald", "patrick_caruso"],
  );
});

test("dashboard read model surfaces blockers without silently advancing the gate", () => {
  const instance = buildSuiteWorkflowReadModel({
    workflowInstanceId: "wf_blocked",
    suiteObjectReferenceId: "sor_blocked",
    templateKey: "subcontract_rfq",
    gateObservations: [
      {
        key: "bid_no_bid",
        status: "blocked",
        blockingDependencies: ["governance:risk-123"],
      },
    ],
    lastEventType: "governance.gate.blocked",
    lastEventAt: "2026-07-15T12:00:00.000Z",
  });

  const dashboard = deriveWorkflowDashboardStatus(instance, new Date("2026-07-15T12:30:00.000Z"));
  assert.equal(dashboard.health, "blocked");
  assert.deepEqual(dashboard.openBlockingDependencies, ["governance:risk-123"]);
  assert.equal(dashboard.currentGate, "intake_completeness");
});

test("waivers require a human approver, reason, timestamp, and linked risk record", () => {
  const valid = buildSuiteWorkflowReadModel({
    workflowInstanceId: "wf_waived",
    suiteObjectReferenceId: "sor_waived",
    templateKey: "quick_commercial_quote",
    gateObservations: [
      {
        key: "eligibility_readiness",
        status: "waived",
        completedAt: "2026-07-15T12:00:00.000Z",
        waiver: {
          reason: "Accepted commercial exception",
          approver: "brian_macdonald",
          approvedAt: "2026-07-15T12:00:00.000Z",
          linkedRiskRecordId: "risk-123",
          actorType: "human",
        },
      },
    ],
    lastEventType: "governance.gate.waived",
    lastEventAt: "2026-07-15T12:00:00.000Z",
  });
  assert.deepEqual(validateSuiteWorkflowReadModel(valid), []);
  assert.equal(deriveWorkflowDashboardStatus(valid).health, "waived");

  const invalid = buildSuiteWorkflowReadModel({
    workflowInstanceId: "wf_ai_waived",
    suiteObjectReferenceId: "sor_ai_waived",
    templateKey: "quick_commercial_quote",
    gateObservations: [
      {
        key: "eligibility_readiness",
        status: "waived",
        completedAt: "2026-07-15T12:00:00.000Z",
        waiver: {
          reason: "AI recommendation",
          approver: "brian_macdonald",
          approvedAt: "2026-07-15T12:00:00.000Z",
          linkedRiskRecordId: "risk-456",
          actorType: "ai",
        },
      },
    ],
    lastEventType: "governance.gate.waived",
    lastEventAt: "2026-07-15T12:00:00.000Z",
  });
  assert.match(validateSuiteWorkflowReadModel(invalid).join(" "), /AI may not waive/);
});

test("AI approval decisions cannot satisfy a required human gate", () => {
  const instance = buildSuiteWorkflowReadModel({
    workflowInstanceId: "wf_ai_approval",
    suiteObjectReferenceId: "sor_ai_approval",
    templateKey: "subcontract_rfq",
    gateObservations: [
      {
        key: "bid_no_bid",
        status: "completed",
        completedAt: "2026-07-15T12:00:00.000Z",
        approvals: [
          {
            approver: "brian_macdonald",
            status: "approved",
            decidedAt: "2026-07-15T12:00:00.000Z",
            decisionBy: "mini-mac",
            actorType: "ai",
          },
        ],
      },
    ],
    lastEventType: "bid_no_bid.approved",
    lastEventAt: "2026-07-15T12:00:00.000Z",
  });
  assert.match(validateSuiteWorkflowReadModel(instance).join(" "), /AI may not approve or reject/);
});

test("Pricing and Finance remain separate authorities through post-award routing", () => {
  const quickQuote = getWorkflowTemplate("quick_commercial_quote");
  assert.equal(quickQuote.routeApps.includes("pricing"), true);
  assert.equal(quickQuote.routeApps.includes("finance"), true);
  assert.equal(quickQuote.routeApps.includes("contracts"), true);
  assert.equal(quickQuote.requiredHandoffTypes.includes("proposal_to_pricing_request"), true);
  assert.equal(quickQuote.requiredHandoffTypes.includes("pricing_to_proposal_approved_volume"), true);
  assert.equal(quickQuote.requiredHandoffTypes.includes("pricing_to_finance_award_assumptions"), true);
  assert.equal(quickQuote.requiredHandoffTypes.includes("proposal_to_contracts_award_handoff"), true);
  assert.equal(quickQuote.defaultGates.find((gate) => gate.key === "post_award_handoff")?.ownerApp, "contracts");
});

test("every pursuit routes approved pricing into Finance by reference", () => {
  for (const key of WORKFLOW_TEMPLATE_KEYS) {
    const template = getWorkflowTemplate(key);
    assert.equal(template.routeApps.includes("pricing"), true, key);
    assert.equal(template.routeApps.includes("finance"), true, key);
    assert.ok(template.routeApps.indexOf("pricing") < template.routeApps.indexOf("finance"), key);
    assert.equal(template.requiredHandoffTypes.includes("pricing_to_finance_award_assumptions"), true, key);
  }
});
