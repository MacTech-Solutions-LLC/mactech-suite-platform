# Local Repo Map

Two local workspace roots exist. This file is the canonical reference for which workspace is authoritative for each repo.

**Last verified:** 2026-06-11

---

## Workspace Layout

| Root | Primary Repos | Notes |
|------|---------------|-------|
| `C:\Users\MacTech_Git` | Opportunities, Pricing, Proposal, Master Architecture | Active Phase B design system work; Hub copy is stale (pull before use) |
| `C:\MacTech-Suite-repos` | Hub (current), Governance, QMS, BizOps, Client Portal, Contracts/Delivery, EnclaveWatch, Training | Hub is authoritative here |

---

## Per-Repo Source Locations

### Hub (`mactech-suite-platform`)

| Location | Status |
|----------|--------|
| `C:\MacTech-Suite-repos\mactech-suite-platform` | **Canonical local copy** — current on `main` |
| `C:\Users\MacTech_Git\mactech-suite-platform` | Secondary — may lag origin/main; pull before Hub work |

Remote: `https://github.com/MacTech-Solutions-LLC/mactech-suite-platform.git`

> **Rule:** Do Hub development from `C:\MacTech-Suite-repos\mactech-suite-platform`. Pull the MacTech_Git copy before any Hub work there.

### Opportunities / Growth & Capture

| Location | Branch | Status |
|----------|--------|--------|
| `C:\Users\MacTech_Git\Opportunities` | `agent/suite-uniformity-phase-b` | Phase B active — use this for Opp work |
| `C:\MacTech-Suite-repos\Opportunities` | `agent/suite-uniformity-phase-a` | Behind — Phase A only |

Remote: `https://github.com/MacTech-Solutions-LLC/Opportunities.git`
Default branch: `master` (rename to `main` pending)

### Pricing

| Location | Branch | Status |
|----------|--------|--------|
| `C:\Users\MacTech_Git\Pricing` | `agent/suite-uniformity-phase-b` | Phase B active, **2 commits ahead of origin/main** — PR pending |
| `C:\MacTech-Suite-repos\Pricing` | `agent/hub-client-packaging-v1` | Hub-client packaging work |

Remote: `https://github.com/MacTech-Solutions-LLC/Pricing.git`

### Proposal

| Location | Branch | Status |
|----------|--------|--------|
| `C:\Users\MacTech_Git\Proposal` | `agent/suite-uniformity-phase-b` | Phase B active — use this for Proposal work |
| `C:\MacTech-Suite-repos\Proposal` | `main` | Behind Phase B |

Remote: `https://github.com/MacTech-Solutions-LLC/Proposal.git`

### Governance

| Location | Status |
|----------|--------|
| `C:\MacTech-Suite-repos\Governance` | Active — use this |

Remote: `https://github.com/MacTech-Solutions-LLC/Governance.git`

### QMS

| Location | Status |
|----------|--------|
| `C:\MacTech-Suite-repos\QMS` | Active — use this |

Remote: `https://github.com/MacTech-Solutions-LLC/QMS.git`

### BizOps

| Location | Status |
|----------|--------|
| `C:\MacTech-Suite-repos\bizops` | Active — use this |

Remote: `https://github.com/MacTech-Solutions-LLC/bizops.git`

### Client Portal

| Location | Status |
|----------|--------|
| `C:\MacTech-Suite-repos\client-portal` | Active — use this |

Remote: `https://github.com/MacTech-Solutions-LLC/client-portal.git`

### Contracts / Delivery

| Location | Status |
|----------|--------|
| `C:\MacTech-Suite-repos\contracts-delivery` | Active — use this |

Remote: `https://github.com/MacTech-Solutions-LLC/contracts-delivery.git`

### EnclaveWatch (Secure Satellite)

| Location | Status |
|----------|--------|
| `C:\MacTech-Suite-repos\enclavewatch` | Active — secure satellite, do not merge into SaaS monorepo |

Remote: `https://github.com/MacTech-Solutions-LLC/enclavewatch.git`

### Training

| Location | Status |
|----------|--------|
| `C:\MacTech-Suite-repos\mactech-training` | Active — use this |

Remote: `https://github.com/MacTech-Solutions-LLC/mactech-training.git` (or `bmacdonald417/MacTech_Training` — verify)

### Cyber Range (Internal Tool)

| Location | Status |
|----------|--------|
| `C:\Users\MacTech_Git\MacTech_Cyber_Range` | Active — internal tool, not customer-facing SaaS |

Remote: `https://github.com/MacTech-Solutions-LLC/MacTech_Cyber_Range.git`

---

## Master Architecture / Planning Docs

| Location | Purpose |
|----------|---------|
| `C:\Users\MacTech_Git\MacTech Suite - Master Architecture & Buildout\` | Local mirror of Google Drive planning docs |

Google Drive: `https://drive.google.com/drive/folders/1HHKv1srRYqY8EWoSSF-YOcb_UY37uN0j`

These are planning-only. They do not authorize implementation, schema changes, migrations, or production changes.

---

## Key Rules

1. **Hub is source of truth** for identity, orgs, roles, entitlements, audit, and app registry. Never build local authority tables in satellite apps.
2. **Do Hub work from `C:\MacTech-Suite-repos\mactech-suite-platform`** — it tracks origin/main.
3. **Do Opp/Pricing/Proposal work from `C:\Users\MacTech_Git`** — Phase B branches are active there.
4. **No production deployments without Brian approval** — not by agents, not by CI, not unilaterally.
5. **`AGENTS.md` in every repo** must bind `DR-2026-06-10-01` and `DR-2026-06-10-02`.
6. **`/api/health` and `/api/build-info`** are required on every app for Command Center health monitoring.
