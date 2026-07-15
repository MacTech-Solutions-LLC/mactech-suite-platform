# Suite Workflow App Wiring TODOs

This is the follow-on implementation queue. These items are intentionally not wired in this Hub-only change. Downstream apps wire to Hub by emitting references, snapshots, handoff packets, and audit events — no app receives a deep rewrite from this PR.

## Hub

- **Completed in vNext.2:** versioned template registry, distinct PricingOS and Finance authorities, Contracts app authority, runtime hard-trigger approvers, operational gate read model, blocker/waiver validation, dashboard status derivation, authenticated template-registry API, and the authorized Hub workflow registry UI.
- Persist `SuiteWorkflowTemplate`, `SuiteWorkflowInstance`, `SuiteDependency`, `SuiteApproval`, and `SuiteEvent` only after the contract has been reviewed and Brian authorizes schema work.
- Add dashboard queries that hydrate the pure `SuiteWorkflowInstanceReadModel` from approved workflow events and references.
- Add a workflow template selector that uses Growth & Capture and Governance recommendations without overriding their authority.
- Require waiver reason, approver, timestamp, and linked risk record before any waived gate is displayed as acceptable.
- Implement Hub-centric OAuth connector registry — Hub brokers and rotates all external tokens (QuickBooks, Google Workspace, timekeeping) per tenant. No satellite holds credentials.

## BizOps

- Add connection settings UI — tenant org admins initiate OAuth flows here; BizOps routes to Hub for token storage and rotation.
- Consume T1 status events and render tenant control panel dashboard.
- Route tenant self-management actions to Hub within Hub-controlled permissions only.

## Growth & Capture

- Emit Capture Package references with immutable hashes through `SuiteObjectReference`.
- Send `capture.pursuit.created`, `capture.bid_no_bid.packet_prepared`, `capture.handoff.proposal_requested`, `capture.handoff.pricing_requested`, `capture.handoff.governance_requested` events to Hub.
- Include cyber, CUI, CDI, CMMC, DD254, classified, insurance, bonding, and submission-instruction indicators in the Capture Package snapshot.
- Push pursuit stage and PWin to BizOps.

## Governance

- Produce Governance Readiness Snapshot references instead of forcing proposal-time live re-query.
- Emit gate status events for screening, readiness, bid/no-bid, waivers, and contract handoff.
- Keep clause risk, flowdowns, retention posture, and contract truth authoritative in Governance.
- Read charge code setup and PoP boundaries from Finance through Hub proxy when Finance exists — no write access, no invoice visibility.
- Push approval events, obligation flags, and clause exceptions to BizOps.

## PricingOS (appKey: `pricing`)

- Own pricing math, rate snapshots, BOE, scenarios, proposed price, price volume, cost realism, and Green Team approval.
- Emit `pricing.request.created`, `pricing.scenario.created`, `pricing.green_team.approved`, and `pricing.volume.exported` events to Hub.
- Produce immutable approved pricing packages and price-volume references for Proposal, plus approved award-assumption references for Finance.
- Never own accounting actuals, invoices, payments, or charge codes.

## Finance (appKey: `finance`)

- Own timekeeping, corrections, approvals, labor distribution, accounting integrations, invoicing, payments, charge codes, reconciliation, and financial actuals.
- Consume PricingOS award assumptions by immutable reference; never edit approved pricing calculations.
- Emit `finance.charge_code_plan.created`, `finance.labor_distribution.posted`, invoice, payment, reconciliation, and closeout events to Hub.
- Produce timekeeping-readiness snapshots, labor-distribution hashes, and accounting export references.
- Consume work authorization from Contracts & Delivery; never invent contract, CLIN, period, or personnel authorization.
- QuickBooks handoff is a Hub-proxied call — Finance never holds the OAuth token directly.
- Push invoice aging, burn rate vs. funded value, and rate alerts to BizOps.

## Proposal
- Consume Growth & Capture and Governance references for kickoff.
- Request pricing through a standard handoff packet to PricingOS.
- Attach only approved PricingOS price-volume references and hashes.
- Emit submission, receipt, award/loss, and post-award handoff events.
- Push submission status, deadlines, and awarded/lost outcome to BizOps.
- Reconcile existing Proposal readiness and submission work through a dedicated review PR before adopting the vNext.2 packet names.

## Contracts & Delivery

- Own awarded contract lifecycle: CLINs, mods, periods of performance, work authorizations, CDRLs, key personnel, teaming parties, CPARS, and closeout.
- Read invoice references and charge code validation from Finance through Hub.
- Push award notice, mod events, and PoP milestones to BizOps.
- Governance interim registry migrates into Contracts on split authorization.
- Consume `proposal_to_contracts_award_handoff` plus `governance_to_contracts_award_package`.
- Emit `contracts_to_finance_work_authorization`, `contracts_to_governance_obligation_baseline`, `finance_to_contracts_invoice_reference`, and `contracts_to_governance_closeout_record` packets.

See `docs/SUITE_WORKFLOW_IMPLEMENTATION_SLICES.md` for the ordered acceptance criteria across Governance, Finance, Proposal, Contracts, and end-to-end pilots.

## QMS

- QMS owns controlled documents and quality records.
- Push exceptions only to BizOps — failed audits, overdue CAPAs.
- Hub stores references and workflow blockers only.

## Training

- Training owns assignments, completions, and evidence.
- Push exceptions only to BizOps — expired certs, overdue assignments.
- Hub stores references and workflow blockers only.

## Client Portal

- Consume tenant-safe BizOps summaries and Hub entitlement snapshots.
- Gate all display through Hub authority — never a domain authority.
- Subtenant/guest access scoped to explicit Hub grants per contract engagement.

## Workspace Gateway

- Surface OAuth connection setup UI for tenants (QB, Google, timekeeping) — routes to Hub for token brokering.
- AI assistant actions via app APIs only, with the tenant's own entitlements.
- Google Calendar: propose-first, draft invites, free/busy on tenant calendars only — never reads external calendars.
- Every AI action is audited through Hub.

## T3 Satellites — Codex/Vault, EnclaveWatch, CUI Vault, Cyber Range (excluded from active build)

No implementation authorized on any T3 surface. When ready, these surfaces wire to Hub exclusively through:

- `POST /api/hub/object-references` — durable cross-app references only
- `POST /api/hub/audit/events` — audit event ingestion (requires service token with `audit_ingest` scope)

Hub stores the reference and event only — never the evidence body. No T1 domain authority, no Hub authority snapshots, no entitlement checks are issued to T3 surfaces until the build is explicitly authorized by Brian.
