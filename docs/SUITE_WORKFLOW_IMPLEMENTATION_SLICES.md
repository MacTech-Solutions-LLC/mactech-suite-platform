# Suite Workflow Implementation Slices

This is the ordered implementation plan for Finance, Governance, Proposal, and Contracts & Delivery after the Hub vNext.1 coordination contract. Each slice is independently reviewable, additive, and preserves the owning app as the source of truth.

## Foundation now available in Hub

- versioned workflow template registry for eleven pursuit types;
- minimum eleven-gate model with one owning app per gate;
- runtime cyber, classified, quality, infrastructure, margin-risk, and insurance/bonding indicators;
- human-only approval and waiver validation;
- blocked, late, waived, submitted, won, lost, post-award, and closed dashboard health;
- Contracts & Delivery as the post-award and closeout execution owner;
- standard handoff packets with immutable source snapshot references and AI provenance;
- authenticated read-only registry endpoint at `GET /api/hub/workflows/templates`.

No downstream domain record is persisted in Hub by this foundation.

## Slice 1 — Governance readiness and gate authority

Governance owns the readiness and risk facts consumed by every later slice.

Deliverables:

1. Produce an immutable Governance Readiness Snapshot containing eligibility, SAM/UEI/CAGE references, reps/certs, clause risk, cyber/CUI indicators, insurance/bonding status, accounting-readiness concerns, required approvals, and recommended workflow template.
2. Emit `governance.screening.started`, `governance.readiness.snapshot.created`, `governance.gate.completed`, `governance.gate.blocked`, and `governance.gate.waived` events.
3. Require waiver reason, human approver, timestamp, and linked Governance risk record.
4. Send `governance_to_proposal_guidance` and `governance_to_contracts_award_package` handoff packets by immutable snapshot reference.
5. Keep clause interpretation, flowdowns, risk acceptance, obligations, and retention policy in Governance.

Acceptance:

- a CUI or DFARS indicator adds Patrick and Brian before bid/no-bid and proposal readiness;
- an incomplete gate returns an explicit blocker rather than advancing;
- Proposal and Contracts can verify the referenced snapshot hash without copying the source record.

## Slice 2 — Finance pricing, pre-award, and actuals workflow

Finance owns proposed price and financial actuals. It does not invent awarded contract authority.

Deliverables:

1. Consume `proposal_to_finance_pricing_request` or `capture_to_finance_pricing_request` packets.
2. Emit `finance.pricing_request.created`, `finance.pricing_scenario.created`, `finance.green_team.started`, `finance.green_team.approved`, and `finance.pricing_volume.exported`.
3. Produce immutable approved pricing-package and price-volume references with version, hash, Green Team approval, BOE summary, and human approval identity.
4. Complete the pre-award finance checklist for customer/project mapping, charge-code plan, CLIN/SLIN mapping, billing assumptions, payment terms, direct labor, subcontractors, unallowables, reimbursables, travel/ODC, tax, and cashflow risk.
5. Consume `contracts_to_finance_work_authorization`; reject time or actuals outside the authorized contract, CLIN, period, person, or charge code.
6. Emit labor-distribution, invoice-reference, reconciliation, and closeout status events without exposing accounting credentials to satellite apps.

Acceptance:

- Proposal can attach but cannot edit an approved Finance price volume;
- Finance cannot activate a charge code without a Contracts work authorization;
- pricing versions remain immutable after approval;
- time corrections retain their original entry and complete audit trail.

## Slice 3 — Proposal execution and submission workflow

Proposal owns pursuit execution, reviews, submission packaging, receipt capture, and award/loss outcome.

Deliverables:

1. Create a pursuit only from referenced Capture and Governance snapshots.
2. Generate the backwards schedule, compliance matrix, volume structure, assignments, color-team plan, required forms, AI disclosure log, and submission checklist.
3. Request Finance pricing with a standard handoff packet and accept only an approved immutable Finance package.
4. Enforce Pink, Red, Green, Gold, and White Glove review evidence before final approval.
5. Block submission readiness when Governance, Finance, cyber, quality, or executive approvals remain open.
6. Record human submission, destination, timestamp, final hash, receipt number, confirmation evidence, and final artifact references.
7. Emit `proposal.submitted`, `award.outcome.recorded`, and the correct award handoffs to Governance, Finance, and Contracts.

Acceptance:

- Proposal cannot alter Finance calculations or approve pricing;
- AI-generated content remains draft until a human review is recorded;
- submission cannot complete without a receipt or an explicit documented receipt exception;
- award/loss produces a deterministic, replayable event and handoff trail.

## Slice 4 — Contracts & Delivery post-award workflow

Contracts owns execution of the awarded contract lifecycle while Governance owns obligation interpretation and retention policy.

Deliverables:

1. Accept `proposal_to_contracts_award_handoff` or `finance_to_contracts_award_handoff` plus `governance_to_contracts_award_package`.
2. Create awarded contract, CLIN/SLIN, modification, period-of-performance, funded-value, deliverable/CDRL, key-personnel, teaming-party, CPARS, and closeout records.
3. Produce signed work authorizations for Finance containing contract, CLIN, period, personnel, charge-code, and funding boundaries.
4. Send obligation-baseline and closeout-record references to Governance.
5. Read Finance invoice references and charge-code validation through Hub; do not store accounting actuals as Contract truth.
6. Route quality and training requirements to QMS and Training by reference.

Acceptance:

- no time or cost can post against an expired or unfunded authorization;
- modifications preserve the previous contract baseline and effective dates;
- Governance can trace every active obligation to the current contract/mod snapshot;
- closeout cannot complete with open deliverables, unresolved obligations, unreconciled Finance status, or missing retention classification.

## Slice 5 — End-to-end workflow pilots

Pilot in this order:

1. Subcontract RFQ / prime quote request.
2. CUI/CMMC/Codex opportunity.
3. ISO/QMS consulting opportunity.
4. Prime federal RFP.
5. Grant/SBIR/STTR.

Each pilot must prove:

- tenant and Hub authority isolation;
- immutable snapshot and object-reference continuity;
- blocker and waiver visibility;
- human-only approvals;
- Finance/Proposal/Contracts/Governance authority boundaries;
- replayable audit events from intake through closeout;
- rollback without destructive data changes.

## Release rule

Build each slice on its owning repository branch, validate locally, open a review PR, and merge only after its domain owner accepts the contract. Production database migrations and environment changes require separate explicit authorization and a rollback plan.
