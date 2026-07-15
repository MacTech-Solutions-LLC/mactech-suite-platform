# Suite Workflow Contract vNext

> **Aligned to v3 architecture boundary map + decisions logged 2026-06-11.**
> DR-2026-06-10-01 (Clerk/Hub identity boundary) · DR-2026-06-10-02 (Pre-Tenant Speed Mode)
> T3 surfaces (EnclaveWatch, Cyber Range, CUI Vault, Codex/Vault) are excluded from the active build — API channels only.

Hub is the MacTech Suite workflow command center. It coordinates workflow state, app routing, object references, approvals, dependencies, and audit visibility. It does not replace domain apps as authorities over their own records.

## Tier Map (v3)

| Tier | Surface | Build status |
| --- | --- | --- |
| T0 | Hub / Command Center | **Active.** Suite control plane: identity, tenancy, entitlements, app registry, audit ledger, Hub-centric OAuth connector broker. MacTech-internal only — tenants never access Hub directly. |
| T1 | BizOps, Growth & Capture, Governance, PricingOS, Finance, Proposal, Contracts & Delivery, QMS, Training | **Active.** Domain authority layer — each app owns records only inside its bounded domain. |
| T2 | Client Portal, Workspace Gateway | **Active.** Display & intake layer. Reads authoritative data; owns no core business records. Workspace Gateway is the OAuth setup surface for tenants; Hub executes and stores tokens. |
| T3 | EnclaveWatch, Cyber Range, CUI Vault, MacKali (pending) | **Excluded from current build.** Hub holds API channels for references and audit events only — no implementation authorized. |

## Authority Boundaries

| Domain | Authority |
| --- | --- |
| Users, organizations, roles, app access, entitlements, suite object graph, OAuth token registry | Hub (T0) |
| Company profile, offers, campaigns, leads, team records, SAM registrations, reps/certs | BizOps (T1) |
| Opportunity discovery, solicitation intake, qualification, pursuit planning, Capture Package | Growth & Capture (T1) |
| Governance packets, bid/no-bid decisions, awarded contracts registry (interim) | Governance (T1) |
| Pricing math, rate snapshots, BOE, scenarios, proposed price, price volume, cost realism, Green Team approval | PricingOS (T1) — appKey `pricing` |
| Timekeeping, labor distribution, accounting integrations, invoicing, payments, charge codes, reconciliation, and financial actuals | Finance (T1) — appKey `finance` |
| Proposal workspace, drafts, submission package coordination | Proposal (T1) |
| Quality records, procedures, controls, corrective actions | QMS (T1) |
| Training catalog, assignments, completion records | Training (T1) |
| Awarded contract lifecycle, CLINs, periods of performance, work authorization, mods, deliverables, CPARS | Contracts & Delivery (T1) |
| Tenant-facing control panel, onboarding, suite status aggregation | Client Portal (T2) |
| OAuth setup UI, Google/Drive/Calendar connector, AI assistant actions | Workspace Gateway (T2) |
| Secure evidence, POA&M, CUI, cyber exercises | T3 satellites — API-channel only until build authorized |

Hub may store suite-level status, references, workflow events, dependency summaries, and approval references. It must not store downstream source-of-truth bodies as a new authority.

## Hub-Centric OAuth Topology

All external OAuth credentials (QuickBooks, Google Workspace, timekeeping platforms, Microsoft Graph) are brokered and stored exclusively by Hub. No satellite app ever holds, rotates, or directly calls an external OAuth credential.

### Tenant onboarding flow

```
Tenant sets up in BizOps (connection settings UI)
        ↓
BizOps routes to Hub / Command Center
        ↓
Hub brokers OAuth per tenant — stores and rotates tokens
        ↓
Satellites make scoped data requests through Hub
Hub proxies the external call and returns only what the satellite is authorized to see
```

### Satellite data request pattern

| Satellite | What it requests through Hub |
| --- | --- |
| PricingOS | Governance-approved rate-card references and pricing package export status |
| Finance | QuickBooks actuals proxy (own tenant), approved pricing assumptions by immutable reference, timekeeping, and labor distribution |
| Contracts | Invoice references (read-only), PoP financial boundaries |
| Governance | Charge code validation, PoP boundaries (read-only, no invoice visibility) |
| Workspace Gateway | Google Drive/Gmail artifact send-receive; Calendar propose-first via Hub broker |

**Rule:** If an app needs external data, it asks Hub. Hub decides what to surface based on the tenant's authorized connections and the requesting app's role. Refresh token rotation lives in Hub only.

## Identity Boundary (DR-2026-06-10-01)

Clerk authenticates the session. Hub authorizes everything. Satellite apps consume Hub context; they must never create competing users, orgs, tenants, roles, or entitlements. All access changes trace to Hub.

## BizOps as Tenant Control Panel

BizOps is the tenant's consolidated interface for the entire suite. Tenants manage their domain through BizOps; they never access Hub directly. BizOps surfaces what Hub allows and writes back to Hub only within the permissions Hub has granted that tenant.

### T1 → BizOps event reporting

All T1 apps push status events to BizOps for tenant dashboard aggregation.

| App | Events pushed to BizOps |
| --- | --- |
| Growth & Capture | Pursuit stage, bid/no-bid decisions, PWin |
| Proposal | Submission status, deadlines, awarded/lost outcome |
| Contracts | Award notice, mod events, PoP milestones |
| PricingOS | Pricing request status, Green Team approval, approved price-volume reference |
| Finance | Invoice aging, burn rate vs. funded value, actuals and charge-code alerts |
| Governance | Approval events, obligation flags, clause exceptions |
| QMS | Exceptions only — failed audit, overdue CAPA |
| Training | Exceptions only — expired cert, overdue assignment |

QMS and Training push alerts only — not routine status — to keep tenant signal-to-noise clean.

**Architecture note:** BizOps is not a domain authority. It is a scoped proxy. T1 apps push events; BizOps displays them and routes tenant self-management actions back to Hub within Hub-controlled permissions.

## T3 API Channels (No Build Authorized)

T3 satellites (EnclaveWatch, Cyber Range, CUI Vault, Codex/Vault) communicate with the suite exclusively through:

- `POST /api/hub/object-references` — emit a `SuiteObjectReference` when a durable cross-app reference is needed
- `POST /api/hub/audit/events` — emit audit events via the Hub audit ingestion contract (requires service token with `audit_ingest` scope)

No T3 surface receives app registry entitlement checks, Hub authority snapshots, or domain data from T1/T2. Hub stores the reference and audit event only — never the evidence body.

## Standard Handoff Packet

Every cross-app handoff carries:

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

## Core Workflow Sequence

```
BizOps (lead/campaign) → Growth & Capture (opportunity → pursuit → bid/no-bid packet)
        ↓
Governance (bid/no-bid approval)
        ↓
Growth & Capture → Proposal + PricingOS (parallel handoff)
        ↓
Proposal → Governance (contract review)
        ↓
PricingOS → Proposal (immutable approved price volume)
        ↓
PricingOS + Proposal / award → Finance (approved assumptions become accounting setup)
        ↓
Proposal → Contracts (award → CLINs, mods, work authorizations, deliverables, CPARS)
        ↓
Contracts → Governance (obligation baseline and closeout record references)
        ↓
Client Portal (tenant-facing milestone visibility)
```

Governance remains authoritative for clause interpretation, obligations, risk acceptance, waivers, and retention policy. Contracts & Delivery owns execution of the awarded contract lifecycle. Hub stores the workflow status and references between those authorities; it does not become either authority.

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

Cyber, CUI, CMMC, DFARS cyber, DD254, classified, cleared-personnel, and secure-enclave indicators force Patrick review before bid/no-bid and final submission readiness, with Brian retaining final business, signature, pricing acceptance, and risk authority. AI may extract, summarize, classify, compare, draft, and recommend, but it may never approve.

## Dashboard Status

Hub dashboard status renders from a compact read model:

- workflow instance and suite object reference
- selected template
- current owner app
- current gate
- workflow health
- open blockers
- required approvals
- next due date
- latest event type and timestamp

Allowed health states: `healthy`, `watch`, `blocked`, `waived`, `late`, `submitted`, `won`, `lost`, `postaward`, `closed`.

## Operational Gate Read Model

`buildSuiteWorkflowReadModel()` compiles the selected template, live opportunity indicators, and app-reported gate observations into a dashboard-ready workflow instance. `deriveWorkflowDashboardStatus()` then computes the current owner, current gate, workflow health, blockers, pending approvals, and next due date without mutating any downstream record.

The read model enforces these rules before a workflow can be presented as complete or waived:

- required gates cannot be marked `not_required`;
- completed gates must have no open blocking dependencies;
- every required human approver must have an approved decision with actor, timestamp, and decision identity;
- AI actors cannot approve, reject, or waive a gate;
- waivers require a human approver, reason, timestamp, and linked risk record;
- runtime FCI, CUI, CDI, DFARS cyber, CMMC, SPRS, DD254, classified, cleared-personnel, or secure-enclave indicators add Patrick and Brian to the applicable gates even when the original template was not classified as cyber-heavy;
- quality-heavy and major-infrastructure indicators add James and Brian to technical and proposal-readiness gates.

Contracts & Delivery is a first-class route on every template because the workflow contract extends through award, performance, and closeout. Quick commercial quotes may use a lightweight Proposal quote record, but PricingOS still owns the math and Finance still owns actuals.

## Template Registry API

Authorized satellite services can read the versioned registry from:

```text
GET /api/hub/workflows/templates
GET /api/hub/workflows/templates?key=subcontract_rfq
```

Requests use the existing Hub service token and `X-MacTech-Source-App` header. The endpoint is read-only and returns the contract version, template definitions, and cross-app route map. It does not create workflow state or write downstream data.

## App Wiring Boundary

This vNext.2 package remains Hub-owned coordination infrastructure. Downstream apps wire to it later by reading the versioned registry and emitting references, snapshots, handoff packets, and audit events. They must not receive deep rewrites from this Hub doctrine update.
