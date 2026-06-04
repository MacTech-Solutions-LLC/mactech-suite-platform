# MacTech Suite Architecture Audit - 2026-06-04

## Executive Summary

MacTech Suite is strongest when treated as a hybrid platform: a shared Hub and shared contracts for identity, access, audit, app registry, operational health, workflow references, and AI governance; separate SaaS app repos for business domains; and secure satellite repos for enclave evidence and field/security tools. A full monorepo would speed shared UI and contract reuse but would blur CUI and field-tool boundaries. A fully disconnected multi-repo model would preserve autonomy but is already producing version drift, duplicated tenant models, naming conflicts, and inconsistent health/audit contracts. The recommended target is a hybrid monorepo plus secure satellites.

The current codebase has several mature pieces: Hub/Command Center, Governance, Pricing, Proposal, Training, EnclaveWatch, and Workspace Gateway all contain meaningful domain logic. The biggest product issue is not lack of apps; it is too many names and overlapping boundaries. CaptureOS overlaps `capture` and `opportunities`; QMS overlaps `quality` and `qms`; Codex/Vault overlaps `codex`, `codex-cui-vault`, and `enclavewatch`; Finance and Contracts are essential but not yet first-class repo/app surfaces.

This audit used local checkouts where available and temporary audit clones for Training and Workspace Gateway. It did not mutate production environments, run migrations, or rewrite downstream apps.

## Repository Inventory

| Repository | Classification | App/domain name | Current stack | Core folders | Database/auth model | Maturity | Source-of-truth role | Inconsistencies | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MacTech-Solutions-LLC/mactech-suite-platform` | Core Suite SaaS app | Hub / Command Center | Next 14, React 18, Clerk 5, Prisma 5, Zod 4 | `app`, `components`, `lib`, `packages`, `prisma`, `docs` | Prisma/Postgres; Clerk; Hub authority, AppRegistry, entitlements, audit | High | Suite identity, orgs, entitlements, app registry, audit, operational health, workflow coordination | Duplicate app keys (`hub`, `identity-command-center`); new workflow contract not pushed yet | Keep as platform control plane; move shared contracts into package; do not absorb domain authority |
| `MacTech-Solutions-LLC/Governance` | Core Suite SaaS app | GovernanceOS | Next 14, React 18, Clerk 5, Prisma 5, Zod 4 | `app`, `components`, `lib`, `packages`, `prisma`, `tests`, `docs` | Prisma/Postgres; Clerk; API auth for governance feeds | Medium-high | GovCon readiness, clauses, reps/certs, delegation, bid/no-bid, contract/compliance truth | No local health/build-info route detected; duplicated Hub-like tenant/user tables; dirty checkout | Keep separate or move into `apps/governance`; standardize Hub authority snapshots and health/build-info |
| `MacTech-Solutions-LLC/QMS` | Core Suite SaaS app | QMS / Quality | Vite React, Clerk React 5, Zod 3, Node server tests | `src`, `server`, `docs`, `scripts`, `public` | No Prisma schema found locally; Clerk React frontend; server-side JS tests | Medium | Controlled documents, CAPA, audit, change control, supplier quality, quality records | Stack differs from Suite Next/Prisma pattern; `quality` vs `qms` identity split; no detected health/build-info | Preserve QMS authority; decide whether to migrate to Next shell or keep Vite with common contracts |
| `bmacdonald417/MacTech_Training` | Core Suite SaaS app | Training | Next package says `^16.1.6`, React 18, Clerk 6, Prisma 5.22, Zod 3 | `app`, `components`, `lib`, `prisma`, `scripts`, `CMMC_Training`, `triptych-player` | Prisma/Postgres; Clerk; organization/membership local models; completion vault | Medium | Training assignments, courses, completions, certificates, evidence of training | README says NextAuth while code uses Clerk; local org/user models duplicate Hub; no health/build-info detected; no normal tests detected | Keep as Training authority, standardize auth docs, Hub identity linkage, health/build-info, audit forwarder |
| `MacTech-Solutions-LLC/Opportunities` | Core Suite SaaS app or needs rename | Capture/Growth | Next 14.2, React 18, Clerk 5, Prisma 5, Zod 3 | `app`, `components`, `lib`, `prisma`, `scripts`, `types` | Prisma/Postgres; Clerk; opportunity/source/calendar models | Medium | Opportunity discovery, capture intake, pursuit ranking | Seed also has `capture` production app; repo is `Opportunities`; no health/build-info detected; `master` branch | Rename/position as Growth & Capture; decide `capture` vs `opportunities`; standardize branch to `main` |
| `MacTech-Solutions-LLC/Proposal` | Core Suite SaaS app | ProposalOS | Next 14, React 18, Clerk 6, Prisma 7, Zod 4 | `app`, `components`, `lib`, `packages`, `prisma`, `docs`, `evidence` | Prisma/Postgres; Clerk; Proposal domain models | Medium | Proposal workspace, compliance matrix, reviews, submission package, award/loss handoff | `package.json` still says `mactech-suite-template`; Prisma 7 drift; no health/build-info detected; no tests detected | Keep Proposal authority; rename package; standardize Prisma/Clerk strategy; add tests and Hub handoff contracts |
| `MacTech-Solutions-LLC/Pricing` | Core Suite SaaS app | PricingOS | Next 14, React 18, Clerk 5, Prisma 5, Zod 4 | `app`, `components`, `lib`, `packages`, `prisma`, `docs`, `evidence` | Prisma/Postgres; Clerk; pricing versions/rates/BOE models | Medium-high | Pricing math, rates, BOE, scenarios, Green Team, price volume export | No health/build-info detected; some test coverage but default `npm test` is placeholder | Keep Pricing authority; expose immutable approved pricing package; standardize tests and Hub packet schema |
| `MacTech-Solutions-LLC/enclavewatch` | Secure enclave/technical service | EnclaveWatch / Vault evidence service | .NET solution, C# projects, extensive tests | `src`, `config`, `docs`, `scripts`, `ux-system` | Not Prisma; enclave/service auth patterns; audit catalog | High for technical service | Vault-resident evidence, drift, audit findings, assessor evidence exports | Dirty checkout; not normal SaaS stack; build-info not detected | Keep as secure satellite; do not merge into normal SaaS monorepo; provide only signed references to Hub |
| `MacTech-Solutions-LLC/MacTech_Cyber_Range` | Internal field tool | Cyber Range / MacKali successor | Kali remaster, Docker, Next dashboard under `web` | `web`, `auto`, `docs`, `kali-config` | Tool dashboard; no Prisma; privileged host/tooling surface | Medium | Internal field/security testing environment | No build-info; not a customer workflow app; risk of being confused with Training/Codex | Keep separate internal tool; publish only mission/export references to Hub/Codex |
| `MacTech-Solutions-LLC/MacTech-mactech-suite-workspace-gateway` | Workspace connector | Google Workspace Gateway | Next 14, React 18, Prisma 5.22, Zod 3, Apps Script | `src`, `prisma`, `docs`, `Code.gs` | Prisma/Postgres intake tables; no Clerk dependency; service/HMAC style Hub token env | Medium | Intake layer only for Google Workspace context | Stores many downstream draft concepts; no build-info; must not become QMS/Governance/Proposal authority | Keep connector; reduce source-of-truth risk; emit Hub references and app-owned intake packets |
| `MacTech-Solutions-LLC/MacTech_Training` | Template/legacy/needs rename | Empty org repo shell | GitHub repo exists but local clone empty/default branch unclear | none locally | none locally | Low/placeholder | None until populated | Duplicates `bmacdonald417/MacTech_Training` naming | Either migrate real Training repo into org or delete/archive placeholder |

## App and Domain Grouping Map

| Target domain | Modules/repos to group | Notes |
| --- | --- | --- |
| Hub / Command Center | `mactech-suite-platform` | Identity, tenants, app registry, entitlements, suite workflow state, audit, deployment health, risk |
| Growth & Capture | `Opportunities`, future CaptureOS module | Combine discovery, intake, capture package generation, Q&A/amendments, capture intelligence |
| Pursuit / Proposal | `Proposal` | Proposal workspaces, schedules, compliance matrix, color reviews, submission bundle, award/loss |
| Pricing & Finance Support | `Pricing`, future Finance module | PricingOS owns proposed cost/price; Finance module owns actuals, invoicing handoff, charge code setup |
| Contracts & Delivery | future Contracts module, Governance handoffs | Post-award admin, mods, deliverables, obligations, closeout, CPARS/past performance |
| Governance & Compliance | `Governance` | Clause/risk/readiness/reps-certs/flowdowns, retention policy, bid/no-bid governance |
| QMS & Training | `QMS`, `Training` | QMS controls docs/quality records; Training owns assignments/completions/certs |
| Secure Evidence & Technical Operations | `enclavewatch`, `codex/codex-cui-vault`, `MacTech_Cyber_Range` | Keep enclave evidence and field tools out of normal SaaS deployment |
| OpsCore / CompanyOS | future module inside Hub or adjacent app | Internal operating records, compliance calendar, support/client success, software change control |

## Source-of-Truth Map

| Domain object | Authority | Consumers |
| --- | --- | --- |
| Users, orgs, roles, entitlements, app access | Hub | All apps |
| App registry, health, deployment metadata, operational risk | Hub | All apps, operators |
| Opportunities and capture packages | Growth & Capture | Governance, Proposal, Pricing |
| Readiness facts, clauses, bid/no-bid, waivers, contract compliance | Governance | Hub dashboard, Proposal, Pricing, Contracts |
| Proposal narrative, compliance matrix, review status, submission package | Proposal | Hub, Pricing, Governance, Contracts |
| Rates, BOE, price scenarios, approved price volume | Pricing | Proposal, Finance, Hub |
| Actual costs, QuickBooks, invoices, charge codes, payments | Finance | Hub, Contracts, Pricing reference only |
| Contract record, mods, deliverables, closeout, CPARS | Contracts | Hub, Governance, Finance, QMS |
| Controlled docs, SOPs, CAPA, quality records | QMS | Governance, Contracts, Training |
| Training courses, assignments, completions, certificates | Training | Governance, QMS, Hub |
| CUI evidence, enclave posture, POA&M, assessor packages | Codex/Vault/EnclaveWatch | Governance and Hub by reference only |
| Field/security exercises and mission exports | Cyber Range | Codex/Vault and Governance by export reference only |
| Google/Microsoft document/mail/calendar context | Workspace connectors | Owning apps as intake packets only |

## Cross-Repo Consistency Issues - Top 25

1. App identity drift: `hub` vs `identity-command-center`; `quality` vs `qms`; `capture` vs `opportunities`; `codex` vs `codex-cui-vault`.
2. Training exists as a real private user repo and an apparently empty org repo.
3. Proposal package name remains `mactech-suite-template`.
4. Opportunities branch is `master`, while most repos use `main`.
5. Framework drift: Next 14, Vite 5, .NET, and Next package declaring 16 in Training.
6. Clerk drift: Clerk 5, Clerk 6, Clerk React 5, and README references to NextAuth.
7. Prisma drift: Prisma 5, Prisma 5.22, Prisma 7, no Prisma, and non-Prisma server patterns.
8. Zod drift: Zod 3 and Zod 4 coexist.
9. Health endpoint missing from Governance, QMS, Training, Opportunities, Proposal, and Pricing local scans.
10. Build-info endpoint missing from nearly every downstream repo local scan.
11. Audit forwarding conventions differ by repo and are not uniformly backed by Hub service identity.
12. Tenant models are duplicated in app schemas instead of using Hub snapshots and references consistently.
13. Workspace Gateway owns too many downstream-shaped draft tables and could become a shadow authority.
14. Test strategy is uneven: Hub/Pricing/EnclaveWatch have tests, Proposal/Training/Opportunities have little or none detected.
15. Lint/typecheck scripts differ (`typecheck`, `type-check`, missing typecheck, strict max warnings in QMS).
16. Build scripts differ in migration behavior; some start scripts run `db push` or migrate on start.
17. Deployment config varies: Railway files, Procfiles, Docker, nixpacks, none.
18. UI shell and design tokens are not uniformly consumed.
19. API route naming is inconsistent (`/api/v1`, app-specific paths, `/workspace/*`, public route variance).
20. Auth-public route handling is not standardized for `/api/health` and `/api/build-info`.
21. Evidence handling boundaries are implied but not enforced uniformly in code contracts.
22. AI action provenance and approval status are not consistently modeled outside the new Hub workflow contract.
23. GitHub webhook/build-info standards are documented in Hub but not implemented across all apps.
24. Environment examples vary and some contain outdated auth terminology.
25. Secure services and normal SaaS apps are both present in AppRegistry but need clearer deployment boundary labels.

## Product and Workflow Gaps - Top 25

1. Contracts/post-award administration is not yet first-class.
2. Finance actuals and QuickBooks workflow are not yet a domain app/module.
3. Vendor/subcontractor management is missing as a coherent module.
4. Timekeeping and labor actuals are missing.
5. DD254/security clearance/site access workflows are missing.
6. Past performance/CPARS is not fully first-class.
7. Compliance calendar is missing.
8. Customer support/client success is missing.
9. Software change control is not consistently tied to QMS/secure evidence.
10. CaptureOS naming and ownership need resolution.
11. Bid/no-bid owner and approver chain must be uniformly modeled.
12. Waiver flow needs reason, approver, timestamp, and linked risk record.
13. CUI/CMMC/classified hard triggers need executable workflow enforcement.
14. Approved pricing package/hash handoff needs adoption across Proposal/Pricing.
15. Governance readiness snapshots need standard immutable references.
16. Capture Packages need immutable hashes and amendment handling.
17. Submission receipt capture and final package hash handling need standardization.
18. Award/loss debrief and lessons-learned loop needs productization.
19. Contract closeout and retention policy need executable workflow state.
20. Training requirements need automatic linkage to contract/delivery roles.
21. QMS controlled records need clean intake from Workspace without authority copying.
22. CUI/GxP classification rules for Workspace actions need stronger guardrails.
23. AI provenance needs common schema and UI markings in every app.
24. App licensing/package entitlements need domain-level packaging design.
25. A sandbox environment needs production-shaped repos, data, health, audit, and Hub routing.

## Monorepo vs Multi-Repo Recommendation

| Option | Developer speed | Deployment safety | Client licensing | Tenant isolation | Compliance evidence | AI reuse | Workspace integration | 20-year maintainability | Security boundaries |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Full monorepo | High early | Medium risk from shared deploy pressure | Medium | Medium | Medium | High | High | Medium | Weak for CUI/field tools |
| Full multi-repo | Low-medium | High per-app isolation | High | High | Medium-high | Low unless contracts mature | Medium | Low-medium due drift | Strong |
| Hybrid monorepo + secure satellites | High for SaaS domains | High with app deploy boundaries | High | High | High | High through shared packages | High | High | Strong |

Recommendation: use a hybrid. Put normal SaaS apps and shared packages in one Suite workspace/monorepo or tightly managed repo family. Keep EnclaveWatch/Codex/Vault and Cyber Range as secure satellite repos with signed reference contracts. Keep Workspace Gateway as a connector satellite that sends intake packets only.

## Ideal Major Domains

Use as few major domains as possible:

1. Hub / Command Center
2. Growth & Capture
3. Pursuit / Proposal
4. Pricing & Finance Support
5. Contracts & Delivery
6. Governance & Compliance
7. QMS & Training
8. Secure Evidence & Technical Operations
9. OpsCore / CompanyOS

Do not create standalone apps for every feature. Contracts, Finance, Vendor Management, Timekeeping, DD254, CPARS, Compliance Calendar, Client Success, and Software Change Control should begin as modules inside the closest major domain unless licensing or security boundaries justify a separate repo.

## DoD Contracting Lifecycle Coverage

| Lifecycle area | Current coverage | Gap |
| --- | --- | --- |
| Opportunity discovery | Opportunities/Capture | Naming and Capture Package contract |
| Capture | Opportunities/Capture | Amendment/Q&A/source attachment hashing |
| Bid/no-bid | Governance/Proposal concepts | Standard approvals and waiver enforcement |
| Teaming | Governance has teaming surface | Vendor/subcontractor module missing |
| Pricing | PricingOS | Approved package handoff adoption |
| Proposal | ProposalOS | Tests, final package standardization |
| Clause review | Governance | Snapshot and flowdown handoff adoption |
| CMMC/CUI/DFARS triggers | Governance/Codex/EnclaveWatch concepts | Hard workflow routing enforcement |
| Award | Proposal/Governance handoff | Contracts module missing |
| Contract administration | Planned | First-class Contracts missing |
| Subcontractor/vendor mgmt | Partial/implicit | Missing |
| Deliverables | Planned | Contracts/Delivery module missing |
| Training | Training | Contract-driven auto requirements |
| Quality records | QMS | Intake and contract linkage |
| Invoice/finance handoff | Planned | Finance module missing |
| Modifications | Planned | Contracts module missing |
| Closeout | Planned | Contracts/Governance retention execution |
| CPARS/past performance | Proposal has some past performance signals | First-class CPARS lifecycle missing |
| Audit/evidence packages | Hub, Governance, EnclaveWatch | Common evidence reference contract adoption |

## Standards and Regulatory Expansion Strategy

- FAR/DFARS: Governance owns clause interpretation, bid/no-bid risk, flowdowns, retention posture, and waiver/risk acceptance.
- CMMC: Governance identifies triggers; Codex/Vault/EnclaveWatch own sensitive evidence and assessor packages.
- NIST SP 800-171, 800-171A, 800-172: Codex/Vault maps controls, evidence, assessment objectives, POA&M, and enhanced control posture.
- FedRAMP: treat as future cloud/service compliance module under Governance plus Secure Evidence; do not claim readiness without evidence.
- ISO 9001: QMS owns processes, controlled docs, CAPA, supplier quality, internal audit, management review.
- ISO/IEC 17025: QMS/Training/Contracts should support lab competence, calibration, method validation, personnel competence, and records.
- GxP and 21 CFR Part 11: QMS owns controlled records, data integrity, audit trails, e-signatures, validation evidence.
- ITAR/EAR/DD254: Governance and Secure Evidence route hard security/export/classified gates; do not commingle with normal SaaS content stores.
- Data integrity: use immutable hashes, event chains, signed exports, human review gates, and source references.
- Electronic signatures: central signature policy should be a Hub/QMS/Governance shared contract, not ad hoc per app.

## AI Applicability

AI may extract, summarize, classify, draft, compare, recommend, prepare checklists, detect inconsistencies, generate first-pass proposal text, suggest pricing assumptions, draft QMS documents, recommend training assignments, and summarize evidence gaps.

AI must not approve bid/no-bid, sign, submit, certify CMMC posture, waive clauses, approve pricing, accept contract risk, modify financial actuals, create final controlled records, or certify evidence.

Every AI action should include source document, source text reference, confidence, model/tool used, human reviewer, approval status, and final version snapshot. AI-generated evidence must be visibly marked and must not be treated as assessor evidence until a human approves and the owning app locks the final version.

## Google Workspace and Microsoft 365 Strategy

Workspace connectors should be intake layers only. Gmail/Outlook can create intake candidates from messages after explicit user action. Docs/Word can send selected document context to QMS/Governance/Proposal drafts. Drive/SharePoint/OneDrive can link files and metadata, not silently copy controlled bodies. Calendar/Teams can suggest milestones, Q&A dates, site visits, reviews, and delivery obligations. Sheets/Excel can feed structured estimates only through owning app validation.

Classification controls must distinguish Public, Internal, FCI, CUI, GxP, export-controlled, classified/DD254, and customer-confidential data. FCI/CUI/GxP transfers should require user confirmation, owning-app review queues, and Hub audit events. Sensitive CUI should route to Codex/Vault references, not Hub bodies.

## 90-Day Refactor Roadmap

1. Publish/push the Hub workflow vNext branch or convert it into a PR.
2. Normalize app keys: decide canonical `capture/opportunities`, `quality/qms`, `codex/vault`, `hub/identity-command-center`.
3. Add `APP_CONTRACT.md` to every repo.
4. Add public `/api/health` and `/api/build-info` to every normal web app and Workspace Gateway.
5. Add build-info to EnclaveWatch and Cyber Range as service-specific endpoints where safe.
6. Standardize Hub audit forwarder and service identity env names.
7. Standardize package versions for normal Next apps: Next 14.2.x, Clerk strategy, Prisma strategy, Zod strategy.
8. Fix Training README/auth mismatch and decide org repo migration.
9. Rename Proposal package from template to ProposalOS.
10. Create Finance and Contracts as modules or sandbox repos with minimal contracts, not full apps yet.
11. Implement SuiteWorkflow handoff packet adoption in Pricing -> Proposal and Governance -> Proposal.
12. Add tests for Proposal and Training critical workflows.
13. Convert Workspace Gateway downstream draft records into intake/reference queues where possible.
14. Add common AI provenance display and schema per app.
15. Create sandbox deployment plan and seed data across apps.

## 12-Month Product Roadmap

1. Production-shaped sandbox with Hub, Growth/Capture, Governance, Proposal, Pricing, QMS, Training, Workspace Gateway, Secure Evidence references.
2. Contracts & Delivery module for award, mods, obligations, deliverables, closeout, CPARS.
3. Finance Support module for pre-award charge code planning, QuickBooks mapping, invoice assumptions, actuals handoff.
4. Vendor/subcontractor module inside Contracts/Governance.
5. DD254/security clearance/site access module under Governance/Secure Evidence.
6. Compliance calendar and obligation engine across Governance/Contracts/QMS.
7. Unified AI provenance and human approval framework.
8. Customer package/licensing model based on Hub entitlements.
9. Workspace and Microsoft 365 connectors with classification gates.
10. Secure evidence expansion for CMMC/NIST/FedRAMP/ISO/GxP with signed exports.

## Recommended Target Repo Structure

```text
mactech-suite/
  apps/
    hub-command-center/
    growth-capture/
    governance/
    proposal/
    pricing-finance-support/
    contracts-delivery/
    qms-training/
    opscore/
  packages/
    suite-contracts/
    hub-client/
    audit-client/
    workflow-contracts/
    ui-shell/
    design-tokens/
    ai-provenance/
  connectors/
    google-workspace-gateway/
    microsoft-365-gateway/

secure-satellites/
  enclavewatch/
  codex-vault/
  cyber-range/
```

If a full monorepo migration is too disruptive, use the same logical structure as repo names and enforce it through shared packages plus `APP_CONTRACT.md`.

## Standard `APP_CONTRACT.md` Template

```md
# APP_CONTRACT.md

## App Identity
- appKey:
- displayName:
- repo:
- publicUrl:
- owner:
- lifecycle:
- classification boundary:

## Authority Boundary
- Owns:
- Consumes:
- Must not own:

## Hub Integration
- Hub service identity:
- Required Hub permissions:
- Audit events emitted:
- SuiteObjectReference types emitted/consumed:
- Workflow handoff packets emitted/consumed:

## Data Model
- Authoritative tables/models:
- Read models/reference tables:
- Retention posture:
- Sensitive data classes:

## API Contract
- Public health:
- Public build-info:
- Authenticated APIs:
- Service APIs:
- Webhooks:

## AI Policy
- AI may:
- AI must not:
- Human approval gates:
- Provenance fields:

## Deployment
- Runtime:
- Database:
- Required env vars:
- Railway/GCP/Vercel service:
- Build command:
- Start command:

## Tests and Evidence
- Test command:
- Typecheck command:
- Build command:
- Evidence artifacts:
```

## Standard Health, Build-Info, and Audit Contract

Health:

```json
{
  "status": "ok",
  "service": "app-key",
  "environment": "production",
  "timestamp": "2026-06-04T00:00:00.000Z"
}
```

Build-info:

```json
{
  "service": "app-key",
  "repo": "owner/repo",
  "branch": "main",
  "commitSha": "full-sha-or-null",
  "commitShortSha": "short-sha-or-null",
  "environment": "production",
  "timestamp": "2026-06-04T00:00:00.000Z"
}
```

Audit event minimum:

```json
{
  "sourceAppKey": "app-key",
  "eventType": "domain.event.completed",
  "eventCategory": "capture|governance|proposal|pricing|qms|training|evidence|system",
  "severity": "info|warning|critical",
  "actorHubUserId": "hub-user-or-null",
  "organizationId": "hub-org-or-null",
  "suiteObjectReferenceId": "ref-or-null",
  "objectType": "domain.object",
  "objectId": "object-id",
  "objectVersion": "version-or-null",
  "objectHash": "hash-or-null",
  "metadata": {}
}
```

## Codex-Ready Implementation Prompts

### Hub

Implement the next Hub workflow slice only. Add persisted or read-model support for Suite workflow instances, dependencies, approvals, and dashboard status using the existing `lib/suite-workflow-core.ts` contract. Do not absorb downstream app authority. Add tests for blocked, waived, and cyber-triggered workflows.

### Governance

Add Suite workflow handoff support for Governance Readiness Snapshots. Emit Hub `SuiteObjectReference` ids and audit events for readiness, bid/no-bid, cyber trigger, waiver, and contract handoff. Do not copy Proposal or Pricing authority.

### QMS

Add `APP_CONTRACT.md`, health/build-info endpoints or service equivalents, and Hub audit forwarder. Normalize `quality` vs `qms` identity. Keep controlled documents and quality records authoritative in QMS.

### Training

Fix README/auth mismatch, add health/build-info, add Hub audit forwarder, and emit training completion/certificate references. Do not let Hub or Governance duplicate training completion truth.

### Growth & Capture / Opportunities

Decide whether this repo becomes CaptureOS or remains Opportunities. Add Capture Package immutable export with hash, Hub object reference creation, and handoff packet to Governance/Proposal. Standardize branch and health/build-info.

### Proposal

Rename package identity from template to ProposalOS. Add health/build-info, critical tests, and standard handoff consumers for Capture Package, Governance Readiness Snapshot, and approved Pricing package. Proposal must not edit pricing math.

### Pricing

Add health/build-info, make default `npm test` run meaningful pricing tests, and emit immutable approved pricing package references to Proposal. Preserve PricingOS as sole pricing math authority.

### EnclaveWatch / Codex-Vault

Keep as secure satellite. Add safe build-info/service-health if appropriate, signed evidence package reference exports, and Hub audit events. Do not expose CUI bodies through Hub or normal SaaS apps.

### Cyber Range

Keep as internal field tool. Add APP_CONTRACT and safe mission/export references. Do not position as customer training or normal workflow app.

### Workspace Gateway

Reinforce intake-only boundary. Convert downstream-shaped records into draft/intake/reference queues. Add build-info, tests for classification gates, and Hub handoff packet emission. Do not become QMS, Governance, Proposal, or Training source of truth.

## Areas Requiring More Inspection

- Live AppRegistry rows and production domains should be verified through Hub DB/Railway before deployment decisions.
- Training org repo vs user repo migration needs GitHub ownership decision.
- Codex/CUI Vault repo contents were not locally present outside AppRegistry references and should be inspected directly.
- Finance and Contracts need explicit repo/module decisions before implementation.
- Microsoft 365 connector does not appear present and should be scoped separately.
