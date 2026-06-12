# Suite Workflow Contract — Phase 1: Hub Contract Registry

## Status

Design — vnext (pending schema migration approval)

## Date

2026-06-11

---

## Overview

The Hub Contract Registry applies the thin-authority model already used for
QMS documents and Governance compliance artifacts to contract lifecycle
management. Hub owns identity, lifecycle state, and access control. The
Contracts satellite owns rich data: CLINs, modifications, periods of
performance, and signed documents.

---

## Lifecycle Stage Map

```
[PIPELINE] ──► [PROPOSAL] ──► [NEGOTIATION] ──► [ACTIVE]
                                                    │
                         ┌──────────────────────────┤
                         │                          │
                      [MOD] ◄───────────────────────┤
                         │                       [OPTION]
                         └──────────────────────────►
                                                    │
                                               [CLOSEOUT]
```

**Stage owners:**

| Stage       | Originating action                          | Authority checkpoint          |
|-------------|---------------------------------------------|-------------------------------|
| PIPELINE    | BD team creates opportunity                 | Hub creates `contractId`      |
| PROPOSAL    | Proposals app marks bid submitted           | Proposals calls Hub on submit |
| NEGOTIATION | Contracting officer opens negotiations      | Hub records lifecycle event   |
| ACTIVE      | Award — Proposals calls Hub `POST /award`   | Hub originates `contractId`   |
| MOD         | Modification issued                         | Contracts app notifies Hub    |
| OPTION      | Option period exercised                     | Contracts app notifies Hub    |
| CLOSEOUT    | Final invoicing complete                    | Contracts app notifies Hub    |

Hub **originates** the `contractId` at PIPELINE or ACTIVE — the Proposals app
calls Hub at award, not the reverse. All downstream satellites receive the
Hub-issued ID; no satellite issues a contract identity independently.

---

## Hub Schema (Phase 1 — thin authority tables)

### `contracts`

| Column            | Type      | Notes                                          |
|-------------------|-----------|------------------------------------------------|
| `id`              | cuid      | Hub-issued contract identity                   |
| `organizationId`  | FK        | Tenant owner                                   |
| `stage`           | enum      | PIPELINE → CLOSEOUT (see map above)            |
| `awardDate`       | DateTime? | Set when ACTIVE; null until then               |
| `farClause`       | String?   | Primary FAR/DFAR clause identifier             |
| `satelliteRef`    | String?   | Opaque pointer to Contracts satellite record   |

Six fields. Hub does not store CLINs, mods, PoP, or signed documents — those
live entirely in the Contracts satellite.

### `contractMembership`

| Column         | Type   | Notes                                                  |
|----------------|--------|--------------------------------------------------------|
| `id`           | cuid   |                                                        |
| `contractId`   | FK     | → `contracts.id`                                       |
| `userId`       | FK     | Internal user (Clerk org member)                       |
| `role`         | enum   | OWNER \| CONTRIBUTOR \| VIEWER                         |
| `grantedById`  | FK?    | Null for system-provisioned entries                    |
| `grantedAt`    | DateTime |                                                      |

External / sub-contractor users use Clerk guest orgs. No parallel identity
system is created — Phase 1 does not extend guest-org access.

### `contractLifecycleEvents`

| Column        | Type     | Notes                                             |
|---------------|----------|---------------------------------------------------|
| `id`          | cuid     |                                                   |
| `contractId`  | FK       | → `contracts.id`                                  |
| `fromStage`   | enum?    | Null on initial creation                          |
| `toStage`     | enum     |                                                   |
| `actorId`     | FK?      | Null for integration-sourced events               |
| `actorType`   | enum     | USER \| INTEGRATION \| SYSTEM                     |
| `evidenceRef` | String?  | Opaque pointer to satellite artifact (e.g. doc ID)|
| `occurredAt`  | DateTime |                                                   |
| `note`        | String?  |                                                   |

`evidenceRef` is intentionally opaque — the Hub does not validate or store the
artifact; the satellite owns it and the Hub records only the pointer.

---

## Authority Checkpoints

| Transition              | Who acts             | Hub writes                     | Satellite owns              |
|-------------------------|----------------------|--------------------------------|-----------------------------|
| Create opportunity      | BD / Proposals       | `contracts` row (PIPELINE)     | Opportunity record          |
| Submit proposal         | Proposals            | lifecycle event (→ PROPOSAL)   | Proposal package            |
| Open negotiations       | Contracting officer  | lifecycle event (→ NEGOTIATION)| Negotiation docs            |
| Award (`POST /award`)   | Proposals → Hub      | stage = ACTIVE, awardDate      | Award document, CLINs       |
| Issue modification      | Contracts → Hub      | lifecycle event (→ MOD)        | Mod document, delta CLINs   |
| Exercise option         | Contracts → Hub      | lifecycle event (→ OPTION)     | Option period record        |
| Closeout                | Contracts → Hub      | lifecycle event (→ CLOSEOUT)   | Final invoicing, SF-30      |

The satellite **notifies** Hub of transitions; it does not ask Hub for
permission to record its own data. Hub is the authoritative log of *when* the
transition happened and *who* authorized it, not the store of the supporting
artifacts.

---

## Connector Registry vs. Contract Registry

These are separate Hub concerns that are joined at runtime, never merged:

| Registry           | Scope             | Key identifier   | Runtime join           |
|--------------------|-------------------|------------------|------------------------|
| Connector Registry | Tenant / OAuth    | `organizationId` | Accounting, HR bridges |
| Contract Registry  | Contract lifecycle| `contractId`     | Contracts satellite    |

A tenant's OAuth connectors do not change when a contract is awarded or closed.
A contract record does not require OAuth connectors to exist. The two tables are
related only by `organizationId` as a shared tenant anchor.

---

## Session Token Approach (Phase 1)

`contractAccess[]` is appended to the existing Hub session token payload based
on `contractMembership` rows for the authenticated user. Satellites read this
claim and apply their own access logic.

Scoped per-contract JWTs (SVID / workload identity) are deferred to Phase 4.
No new token infrastructure is introduced in Phase 1.

---

## Phase 1 Scope

**In scope:**
- Hub Prisma schema: `contracts`, `contractMembership`, `contractLifecycleEvents`
- Hub API: `POST /contracts` (create), `POST /contracts/:id/award`,
  `POST /contracts/:id/lifecycle`, `GET /contracts/:id`,
  `GET /contracts/:id/members`, `PATCH /contracts/:id/members`
- Session token enrichment with `contractAccess[]`
- Contracts satellite: read Hub-issued `contractId`, write lifecycle notifications

**Explicitly deferred:**
- Scoped per-contract JWTs (Phase 4)
- External / sub-contractor Clerk guest org access
- FPDS-NG reporting integration
- Multi-award IDIQ task-order hierarchy
- Automated closeout trigger from accounting final-invoice event

---

## Open Items Resolved

| Item                                        | Resolution                                              |
|---------------------------------------------|---------------------------------------------------------|
| Who originates `contractId`?               | Hub always; Proposals calls Hub on award                |
| Guest org / sub-contractor access?          | Clerk guest orgs; no parallel identity system Phase 1   |
| Connector Registry overlap?                 | Separate tables; joined at runtime by `organizationId`  |
| FPDS-NG reporting?                          | Deferred                                                |
| Scoped JWTs?                               | Deferred to Phase 4; session token enrichment in Phase 1|
