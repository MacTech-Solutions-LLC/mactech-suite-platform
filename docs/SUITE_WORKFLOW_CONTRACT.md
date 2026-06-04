# Suite Workflow Contract vNext

Hub is the MacTech Suite workflow command center. It coordinates workflow state, app routing, object references, approvals, dependencies, and audit visibility. It does not replace CaptureOS, GovernanceOS, ProposalOS, PricingOS, Finance, QMS, Training, or Codex/Vault as domain authorities.

## Authority Boundaries

| Domain | Authority |
| --- | --- |
| Users, organizations, roles, app access, entitlements, suite object graph | Hub |
| Opportunity discovery, solicitation intake, Capture Package generation | CaptureOS |
| Compliance, risk, readiness, clauses, flowdowns, contract truth | GovernanceOS |
| Proposal execution, volumes, reviews, submission package, award/loss handoff | ProposalOS |
| Pricing math, rates, BOE, scenarios, price volume, Green Team | PricingOS |
| Actual accounting, QuickBooks, invoicing, payments, charge codes, financial actuals | Finance |
| Controlled documents, templates, SOPs, quality records | QMS |
| Training requirements, assignments, completions, evidence | Training |
| CUI/CMMC evidence, cyber posture, SSP/POA&M, assessor evidence | Codex/Vault |

Hub may store suite-level status, references, workflow events, dependency summaries, and approval references. It must not store downstream source-of-truth bodies as a new authority.

## Standard Handoff Packet

Every cross-app handoff should carry:

- `suiteObjectReferenceId`
- `workflowInstanceId`
- `sourceApp`
- `targetApp`
- `sourceRecordId`
- `sourceSnapshotId`
- `handoffType`
- `handoffStatus`
- `requiredApprovals`
- `blockingDependencies`
- `AIProvenance`
- `auditEvents`

The implementation contract lives in `lib/suite-workflow-core.ts`. The packet uses `SuiteObjectReference` for durable references and Hub audit events for replayability.

## Workflow Templates

Hub registers reusable workflow templates for:

- Prime federal RFP
- Subcontractor RFQ/RFP
- Quick commercial quote
- Grant/SBIR/STTR
- IDIQ vehicle
- IDIQ task order
- Sole-source/SDVOSB directed opportunity
- Teaming/mentor-protege opportunity
- CUI/CMMC/Codex opportunity
- ISO/QMS/pharma/compliance opportunity
- Classified/cleared support opportunity

Every template carries the minimum gates: intake completeness, eligibility/readiness, bid/no-bid, technical feasibility, pricing/finance readiness, proposal package readiness, executive approval, submission/receipt capture, award/loss outcome, post-award handoff, and closeout/retention.

Cyber, CUI, CMMC, DFARS cyber, DD254, classified, cleared-personnel, and secure-enclave indicators force Patrick review before bid/no-bid and final submission readiness. AI may extract, summarize, classify, compare, draft, and recommend, but it may never approve.

## Dashboard Status

Hub dashboard status should be rendered from a compact read model:

- workflow instance and suite object reference
- selected template
- current owner app
- current gate
- workflow health
- open blockers
- required approvals
- next due date
- latest event type and timestamp

Allowed health states are `healthy`, `watch`, `blocked`, `waived`, `late`, `submitted`, `won`, `lost`, `postaward`, and `closed`.

## App Wiring Boundary

This vNext package is Hub-only. Downstream apps should wire to it later by emitting references, snapshots, handoff packets, and audit events. They should not receive deep rewrites from this Hub doctrine update.
