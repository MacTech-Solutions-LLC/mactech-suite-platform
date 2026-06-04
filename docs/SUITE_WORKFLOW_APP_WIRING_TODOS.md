# Suite Workflow App Wiring TODOs

This is the follow-on implementation queue. These items are intentionally not wired in this Hub-only change.

## Hub

- Persist `SuiteWorkflowTemplate`, `SuiteWorkflowInstance`, `SuiteDependency`, `SuiteApproval`, and `SuiteEvent` only after the contract has been reviewed.
- Add dashboard queries that transform workflow events into `SuiteWorkflowDashboardStatus`.
- Add a workflow template selector that uses CaptureOS and GovernanceOS recommendations without overriding their authority.
- Require waiver reason, approver, timestamp, and linked risk record before any waived gate is displayed as acceptable.

## CaptureOS

- Emit Capture Package references with immutable hashes through `SuiteObjectReference`.
- Send `capture.package.created` and workflow candidate events to Hub.
- Include cyber, CUI, CDI, CMMC, DD254, classified, insurance, bonding, and submission-instruction indicators in the Capture Package snapshot.

## GovernanceOS

- Produce Governance Readiness Snapshot references instead of forcing proposal-time live re-query.
- Emit gate status events for screening, readiness, bid/no-bid, waivers, and contract handoff.
- Keep clause risk, flowdowns, retention posture, and contract truth authoritative in GovernanceOS.

## ProposalOS

- Consume Capture and Governance references for kickoff.
- Request pricing through a standard handoff packet.
- Attach only approved PricingOS price-volume references and hashes.
- Emit submission, receipt, award/loss, and post-award handoff events.

## PricingOS

- Emit pricing scenario, Green Team, BOE, approved price volume, and final export references.
- Keep all pricing math, rates, BOE, margin, and scenario versioning authoritative in PricingOS.

## Finance

- Consume approved pricing and award assumptions for pre-award planning and post-award actuals setup.
- Own QuickBooks, charge codes, invoice schedules, payments, actual costs, and reconciliation.

## QMS, Training, Codex/Vault

- QMS owns controlled documents and quality records.
- Training owns assignments, completions, and evidence.
- Codex/Vault owns sensitive CUI/CMMC evidence packages and assessor evidence.
- Hub should store references, metadata, and workflow blockers only.
