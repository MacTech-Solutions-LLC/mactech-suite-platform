# Suite Permission Rollout — Implementation Plan

**Supersedes** §6 of `SUITE_PERMISSION_MATRIX.md`. Where the matrix's §6 assumed a
greenfield apply, this plan is written against the **actual current state** found in
the 2026-06-12 suite permission audit. Work the steps in order. Step 0 runs in
parallel and blocks nothing.

> Naming: the matrix writes `org·domain·action`; the codebase uses colons
> (`org:domain:action`). They map 1:1. Use colons in code.

---

## Audit baseline (what exists today)

**Hub master (`lib/permissions.ts`) — the authority.**
- `ORG_PERMISSIONS` domains present: dashboard, users, roles, vault, evidence,
  boundary, capture, reports, audit, settings.
- **Missing domains:** finance, contracts, proposals, qms, training, connectors.
- **Missing namespace:** `contract:*` entirely.
- Org roles present: customer_owner, customer_admin, compliance_manager,
  security_manager, evidence_contributor, **auditor (single)**, read_only_user.
- `ContractMembershipRole` enum = `OWNER | CONTRIBUTOR | VIEWER` (Phase 1).
- No tenant-override layer, no workflow bundles, no auditor-filtered audit views.

**Satellite consumers (via `@mactech/hub-client` → `resolvedPermissions`).**
- **Parallel authority (must collapse):**
  - **Governance** — `lib/permissions.ts` + `prisma/seed.ts` are a **1:1 mirror**
    of the Hub model (identical role keys incl. `mactech_*`, identical `org:*`/
    `platform:*` strings). Check sites: `lib/hub-client.ts`, `lib/validations/user.ts`.
  - **Proposal** — app-local `proposal:admin|audit|create|import|pricing` via
    `requireProposalPermission`.
  - **QMS** — app-local `org:sys_domains|sys_memberships|sys_profile:*` admin perms.
- **Coarse-only / cruft:** Opportunities, Pricing(→finance), contracts-delivery,
  bizops gate on coarse `org:admin|member|viewer` + `org:sys_*`.
- **`org:teacher` leakage:** Training's permission copy-pasted via the scaffold
  template into **Opportunities, Pricing, client-portal** (cruft).
- **contractAccess[]** (Phase 1) is **not yet wired** in contracts-delivery/bizops —
  only the `contractMembership` storage exists, nothing reads it. (Greenfield, no
  migration debt on the consumption side.)
- enclavewatch: not auth-integrated yet.

---

## Step 0 — (parallel, low-risk) QMS Railway build fix
Independent of everything below; pick up anytime.
- QMS Railway build fails in nixpacks' install phase (`npm ci`) despite a correct,
  in-sync lockfile (verified: clean `npm ci` passes, byte-identical to committed).
  Root cause is the install running in a context without the root lockfile —
  QMS has a nested `server/package.json`.
- Fix: pin the build root / install command in `railway.json` (or a `nixpacks.toml`)
  so install + build run at repo root against the root lockfile. Do **not** change
  app code.

---

## Step 1 — Hub master PR (foundational; everything reads this)
One PR against `mactech-suite-platform`. Touch only `lib/permissions.ts`,
`prisma/schema.prisma`, and the role seed.

1. **Add domains** to `ORG_PERMISSIONS` (follow existing `org:<domain>:<action>`):
   - `finance`: read, write, rates:read, rates:write, invoice:read, invoice:create, invoice:approve
   - `contracts`: read, write, mod:manage
   - `proposals`: read, write, submit
   - `qms`: read, write, review:read, review:approve
   - `training`: read, assign, certify
   - `connectors`: ai:manage, quickbooks:manage  ← **sensitive: owner-default** (code comment)
2. **Add the `contract:*` namespace** as a separate set (distinct from `org:*`):
   docs:read, docs:write, cdrl:read, cdrl:update, finance:read, finance:write,
   mod:approve, membership:manage.
3. **Extend the 6 existing roles** per matrix §2 (e.g. customer_owner = all org perms
   incl. new domains; compliance_manager += qms:read, qms:review:read; read_only_user
   += contracts:read, proposals:read, qms:read; etc.).
4. **Add 7 operational roles:** capture_manager, proposal_manager, qms_manager,
   finance_manager, contracts_manager, training_manager, program_manager.
5. **Replace single `auditor`** with 4 variants: cmmc_l2_auditor, iso9001_auditor,
   iso27001_auditor, dcaa_auditor (each read-only, scoped per matrix §2).
6. **ContractMembershipRole — additive, not flag-day:** add `OWNER_CONTRACT, COR,
   PM, KEY_PERSONNEL, SUBCONTRACTOR` (or matrix names) **alongside** existing
   `OWNER/CONTRIBUTOR/VIEWER`. Mark the old three `@deprecated` in a comment. Do
   **not** remove them yet (migration is Step 4).
7. `connectors:*:manage` granted **only** to customer_owner in seed defaults; comment
   them "sensitive: owner-default" for the BizOps UI.

**Tests:** no operational role includes `connectors:*:manage`; each auditor variant
excludes its matrix-listed domains.

---

## Step 2 — Collapse parallel authority into Hub consumption

### 2a. Governance (lowest-risk thanks to identity mapping)
- Confirmed: local `lib/permissions.ts` is a **1:1 mirror** of Hub — role names and
  permission strings match exactly, **no divergence**. Mapping is identity.
- Delete `lib/permissions.ts` and the role rows in `prisma/seed.ts`.
- Repoint `lib/hub-client.ts` and `lib/validations/user.ts` to read roles/permissions
  from the Hub snapshot (`resolvedPermissions`) instead of the local constants. Since
  names are identical, this is a source swap, not a remap.
- Ties into held PR #20 (Governance auth → Hub fail-closed). Land together.

### 2b. Proposal
- Replace `proposal:admin|audit|create|import|pricing` with `org:proposals:*`
  (read/write/submit) + reuse `org:audit:view`, `org:reports:export` where it meant those.
- Replace `requireProposalPermission` internals to check Hub `resolvedPermissions`.
- `proposal:pricing` → decide: it gated a pricing view; map to `finance:read` (cross-app)
  rather than a proposals perm.

### 2c. QMS
- `org:sys_domains|sys_memberships|sys_profile:*` are **org-admin** functions, not QMS
  domain perms — map them to `org:users:*` / `org:settings:manage` as appropriate.
- Add real `org:qms:*` (read/write/review:read/review:approve) for the quality surfaces.

---

## Step 3 — Scrub `org:teacher` cruft (+ fix the source)
- Remove `org:teacher` checks from **Opportunities, Pricing, client-portal** (it's a
  Training permission that leaked via scaffold copy-paste; meaningless in those apps).
- **Fix the scaffold template** that introduced it, so future satellites don't
  reintroduce it. (Training keeps it — map to `org:training:assign`/`certify` there.)

---

## Step 4 — ContractMembershipRole migration + contractAccess[] wiring (one unit)
Storage migration and first-time consumption land together (no point migrating the
enum then wiring the array separately).
- **Migrate existing rows:** map `OWNER→Owner`, and for the ambiguous middle, default
  `CONTRIBUTOR→Key Personnel` (most restrictive of PM/KP/COR) and `VIEWER→Subcontractor`;
  let admins re-assign. Deprecate (don't drop) the old enum values until reassignment.
  Low risk: nothing reads these rows yet.
- **Wire contractAccess[] greenfield against the NEW 5-role vocabulary only** — no need
  to support the old 3-enum in the read path. Extend the session/authority resolution
  to return `contractAccess[]` (e.g. when `x-contract-id` present), carrying the
  contract-scoped role + its `contract:*` perms.
- **contracts-delivery and bizops** consume `contractAccess[]` for the first time here
  (greenfield, not a fix). Effective perm = org-role perms + contract-scoped perms for
  that contract.

**Test:** a user with no org role but a Subcontractor membership on Contract X can read
`contract:docs` for X and nothing else.

---

## Step 5 — Override layer, bundles, filtered audit views
- Three-layer resolution: platform default → tenant override (org) → contract-scoped
  override; overrides store **diffs**, not full copies.
- BizOps workflow-bundle selector (matrix §4, 5 presets); applying a bundle is
  idempotent and seeds initial config; later edits become tenant overrides.
- Audit-view filtering: `org:audit:view` results filtered by a role→category allowlist
  (cmmc_l2/iso27001 → access-control + evidence; iso9001 → QMS doc/review; dcaa →
  timekeeping + financial; others → unfiltered).

---

## Resolution order (reference)
`platform default (RoleTemplate seed) → tenant override (org-level diff) →
contract-scoped override (contractMembership)`. Effective contract permission =
org-role perms **+** contract-scoped role perms for that specific contract.
