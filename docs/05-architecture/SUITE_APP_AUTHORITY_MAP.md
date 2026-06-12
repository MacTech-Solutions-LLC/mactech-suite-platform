# Suite App Authority Map

## Status

Current — updated 2026-06-11 to reflect Phase 1 Contract Registry

---

## Overview

Hub is the authority layer for the entire suite. It owns identity, access
control, lifecycle state, and audit log origination. Satellites own rich data
and domain logic, and report lifecycle events back to Hub.

---

## Authority Model

```
┌─────────────────────────────────────────────────────────────────┐
│                            HUB                                  │
│  Identity · Session tokens · Role/permission grants             │
│  Lifecycle state · Audit log origination · App registry         │
└──────────┬────────────────────┬──────────────────┬─────────────┘
           │                    │                  │
    ┌──────▼──────┐   ┌─────────▼──────┐  ┌───────▼──────┐
    │   DOMAIN    │   │   DOMAIN       │  │  CONNECTOR   │
    │ SATELLITES  │   │ SATELLITES     │  │  REGISTRY    │
    │ (repo type) │   │ (workflow type)│  │  (OAuth)     │
    └─────────────┘   └────────────────┘  └──────────────┘
```

### Repository-pattern satellites (rich data, thin Hub record)

These satellites own large, structured data repositories. Hub holds a thin
authority record (identity + lifecycle state + membership) and the satellite
stores all domain content.

| Satellite   | Hub record          | Satellite owns                                  |
|-------------|---------------------|-------------------------------------------------|
| **Contracts** | `contracts` (6 fields) | CLINs, mods, PoP, signed documents, SF-30s |
| **QMS**     | `documents`         | Document revisions, PDFs, CMMC evidence, SSP    |
| **Governance** | signature requests / artifacts | Canonical payloads, signed hashes |

### Workflow-pattern satellites (process state, Hub enforces transitions)

These satellites manage structured workflows where Hub approves or records
each state transition.

| Satellite      | Hub concern                          | Satellite owns               |
|----------------|--------------------------------------|------------------------------|
| **Proposals**  | Award trigger -> Hub issues contractId | Proposal packages, bid history |
| **PricingOS**  | Approved price-package references, Green Team events | Pricing math, rate snapshots, BOE, scenarios, price volume |
| **Finance**    | Finance connector, invoice events, charge-code status | GL entries, invoices, payments, payroll/actuals |
| **HR / Training** | Onboarding connector, role/training grants | Employee records, assignments, completions |

### Connector Registry (OAuth / tenant bridges)

Tenant-level OAuth connectors are registered in Hub's Connector Registry. They
are not contract-scoped and do not change when contracts are awarded or closed.

| Connector type     | Tenant anchor    | Runtime join                       |
|--------------------|------------------|------------------------------------|
| Accounting bridges | `organizationId` | Accounting satellite via Hub token |
| HR / payroll       | `organizationId` | HR satellite via Hub token         |
| External APIs      | `organizationId` | App-specific bridge auth           |

---

## Hub Authority Boundaries

### What Hub always owns

- User identity and Clerk session management
- Role and permission grants (role assignment, permission scoping)
- `contractId` origination (no satellite issues a contract identity)
- Lifecycle event log (the authoritative *when* and *who*)
- Session token issuance and `contractAccess[]` / permission claims

### What Hub never owns

- Document binary content (QMS / Governance satellite storage)
- Contract clause details, CLINs, or modification documents (Contracts satellite)
- Pricing math, rate snapshots, BOE, pricing scenarios, or price-volume source data (PricingOS)
- GL entries, invoices, payments, charge codes, payroll data, or financial actuals (Finance)
- CMMC control evidence or SSP narrative (QMS satellite)

---

## Runtime Join Pattern

Satellites receive Hub-issued identifiers in the session token and use them to
scope their own data. They do not call Hub at query time for routine reads —
the token claim is the authority.

```
User authenticates → Hub issues session token
  token.contractAccess[] = [{contractId, role}]  ← from contractMembership
  token.permissions[]    = ["document:view", …]  ← from Hub permission grants
  token.connectors[]     = [{type, orgId}]        ← from Connector Registry

Satellite receives token → reads relevant claims → applies local access logic
  Contracts:  token.contractAccess → filter to user's contracts
  QMS:        token.permissions   → gate document operations
  PricingOS:  token.permissions   -> gate pricing, Green Team, and export operations
  Finance:    token.connectors    -> resolve accounting bridge credentials
```

Satellites fail closed: an expired token or missing claim results in 401/403,
never in open access. Hub unavailability is never a reason to bypass authority.

---

## Contract Registry + Connector Registry Separation

```
Hub
 ├── contracts          (lifecycle, stage, awardDate, satelliteRef)
 ├── contractMembership (userId × contractId × role)
 ├── contractLifecycleEvents (audit trail with evidenceRef)
 │
 └── oauthConnectors    (organizationId × connector type × credentials ref)
     oauthTokenCache    (short-lived access tokens)
```

The two registries share only `organizationId` as a tenant anchor. A contract
record does not require OAuth connectors. OAuth connectors do not carry
contract-scoped membership or lifecycle state.

---

## Phase 1 Additions (Contract Registry — 2026-06-11)

Contracts moves from an ad-hoc satellite to a first-class Hub-registered
domain, joining QMS and Governance as a repository-pattern satellite:

- Hub schema: `contracts`, `contractMembership`, `contractLifecycleEvents`
- Hub API: contract CRUD + lifecycle event ingestion
- Session token enrichment: `contractAccess[]` claim
- Proposals integration: `POST /contracts/award` call on bid win

Scoped per-contract JWTs and Clerk guest-org access for sub-contractors are
deferred to Phase 4.

See [SUITE_WORKFLOW_CONTRACT.md](SUITE_WORKFLOW_CONTRACT.md) for the full
Phase 1 schema design, stage map, and authority checkpoint table.
