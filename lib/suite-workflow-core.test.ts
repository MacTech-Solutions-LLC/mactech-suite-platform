import assert from "node:assert/strict";
import test from "node:test";
import {
  CROSS_APP_WORKFLOW_MAP,
  getWorkflowTemplate,
  SUITE_WORKFLOW_TEMPLATES,
  validateHandoffPacket,
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
    "pricing",
    "proposal",
    "finance",
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
    validateHandoffPacket({ ...packet, sourceApp: "pricing", targetApp: "pricing" }).join(" "),
    /sourceApp and targetApp must differ/,
  );
});
