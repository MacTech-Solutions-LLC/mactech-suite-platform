# ADR-0003: Suite-Wide Member Capability Profile

## Status

Proposed

## Date

2026-07-16

## Context

A member's capability profile — headline, summary, labor category, years of
experience, clearance, skills, certifications, education, past performance, and
(as of 2026-07-15) NAICS codes — exists only in **bizops** (`GovConMemberProfile`,
keyed on `hubOrganizationId + hubUserId`). It is built from a resume upload,
confirmed field-by-field by the member, and feeds their capability statement.

Other apps in the suite describe the same people independently. **CaptureOS**
(`capture.mactechsolutionsllc.com`) maintains a hand-edited `founders` table —
`full_name`, `title`, `pillar`, `bio`, `areas_of_expertise` — plus a
`founder_naics_matrix` that drives opportunity matching. So one person is
described twice, by hand, in two systems, and the NAICS affinity that steers
capture is maintained separately from the NAICS codes the member just confirmed
on their own profile.

The goal: a member fills in their profile once, in bizops, and every entitled
app in the suite sees it.

### Findings that constrain the design

1. **CaptureOS is not a Hub satellite.** It has no `hub-client`, no
   `resolveAppAccess`, no `hubOrganizationId`; it authenticates against Clerk
   directly, lives in a different GitHub org (`WELCOMETOTHETRIBE/mactech-captureos`),
   and its API is **Python/SQLAlchemy**. `capture.mactechsolutionsllc.com` is not
   in the AppRegistry (the nearest entry is `growth-capture` at
   `opportunities.mactechsolutionsllc.com`).

   → **`hub-client` cannot be the integration surface.** It is a TypeScript
   package. Whatever the Hub exposes must be reachable from Python, i.e. the
   service-token REST pattern already used by `/api/hub/audit`, `/api/hub/authority`,
   and `/api/hub/contracts`.

2. **The join key is the Clerk user id, and it already exists.**

   *Corrected. The first draft of this ADR claimed there was no join key, and
   proposed adding `founders.hub_user_id` populated by a reviewed email match.
   That was wrong, because it looked only at `founders` — which indeed carries
   no user id — and stopped there.*

   CaptureOS already stores `users.clerk_user_id` (set from the token's `sub` at
   sign-in, unique) and already records `users.founder_id` — which founder a
   signed-in person is. The Hub keys the same human by `UserProfile.clerkUserId`
   (also unique). So the chain runs entirely on identifiers **both systems
   already store**:

   ```
   Clerk sub -> users.clerk_user_id -> UserProfile.clerkUserId -> capability profile
                users.founder_id    -> founders
   ```

   → **No new column, no backfill, no email matching.** The rejected design
   would have invented a second link to maintain *and* introduced the only
   mechanism in this whole plan capable of attaching one person's clearance to
   another person's card. Email is good enough to be dangerous — people change
   addresses, share aliases, get typo'd. A Clerk id is a lookup, not a guess.

   The lesson generalises: before adding an identifier, check whether the two
   systems already share one.

3. **The Hub already owns identity.** `UserProfile` holds `clerkUserId`, `email`,
   `firstName`/`lastName`, `platformRole`. It holds no capability data.

4. **Tenancy can line up.** `Tenant.clerk_org_id` (unique, nullable) in CaptureOS
   maps to the `clerkOrgId` on a Hub snapshot.

5. **Two NAICS sources of truth now exist.** bizops ships a checked-in Census 2022
   table (`lib/naics`, 1,012 codes); CaptureOS has a `naics_codes` table with the
   same codes **plus** curation bizops lacks (`size_standard`, `mactech_tier`).

## Decision

**The Hub owns the member capability profile. bizops writes it. Other apps read
it over service-token REST.**

- **Home:** the Hub (`mactech-suite-platform`). It is already the identity and
  authority plane; a satellite owning suite-wide identity data would invert the
  architecture and make every other app depend on bizops being up.
- **Reach:** REST under `/api/hub/profiles/*`, service-token authenticated, same
  pattern as `/api/hub/audit`. `hub-client` gains typed wrappers for TypeScript
  callers, but REST is the contract — Python satellites are first-class.
- **Scope of the profile record:** capability data only. **No name, no email.**
  Identity stays in `UserProfile` and is resolved by `hubUserId` at read time.
  DR-2026-06-10-01 holds; this ADR does not relax it.
- **Identity join:** the Clerk user id, which both systems already store. The
  Hub exposes `GET /api/hub/profiles/by-clerk/{clerkUserId}` alongside the
  canonical `hubUserId` route, because a *writer* holds a Hub id (bizops gets it
  as `canonicalHubUserId`) while a *consumer* usually only has a Clerk id.
  Nothing is added to `founders`, and nothing is backfilled.
- **Direction:** bizops writes; other apps read. Synced fields are read-only in
  the consumer with a "managed in GovCon Ops" affordance.
- **Tenancy:** the profile record is **user-global** (keyed on `hubUserId`, not
  `hubUserId + org`), but **visibility is per-org**: an org sees a profile only
  while that user is an active member of it. This deliberately inverts bizops'
  current per-org scoping — one person has one clearance, and re-typing it per
  org is how profiles drift.

### First slice into CaptureOS

`title` ← `headline`, `bio` ← `summary`, and `founder_naics_matrix` ← the
profile's confirmed NAICS codes. `full_name`, `email`, and `pillar` stay
hand-managed. Skills, certifications, and experience are **not** synced yet —
CaptureOS has no columns for them, and pushing clearance into a second system is
a boundary change that deserves its own decision.

**NAICS is a breadth field, not a shortlist.** A profile carries *every* industry
the member's experience defends, ranked strongest first — not a fixed top-N. A
cyber engineer who also delivers CMMC/RMF/STIG instruction genuinely supports
`541519` *and* `611420` (Computer Training); an earlier top-3 cap silently
dropped the second, and a code that never surfaces is work nobody bids. bizops
enforces only a sanity bound (20) to stop a pathological response.

**The sync must not clobber CaptureOS's curation.** `founder_naics_matrix`
carries an `affinity` weight, and the surrounding registry carries a
`tier` (primary/secondary), a `why_fits` note, and founder routing — all
hand-authored, and none of it derivable from a resume. So the write is
**additive on the join, never a replacement of the row**:

- bizops-derived codes may **add** `(founder_id, naics_code)` pairs.
- `affinity`, `tier`, `why_fits`, and routing are **owned by CaptureOS** and are
  never written by the sync.
- A pair the sync did not propose is **left alone** — a human added it, and a
  resume's silence is not evidence against it.

This is the one place "bizops writes, CaptureOS reads" is scoped to a *field
set* rather than a table. Getting it wrong replaces curated capture intelligence
with an LLM's read of a PDF.

## Consequences

### Accepted

- **Clearance becomes suite-visible.** Today it lives in one GovCon app; on the
  Hub it is readable by any entitled app. This is the single most sensitive
  consequence of this ADR and was chosen knowingly. Mitigation: clearance is not
  in the first sync slice, and per-org visibility gates every read.
- **A tenancy rule is inverted.** Per-org profile isolation gives way to
  user-global data with per-org visibility. Any code assuming a profile is
  org-scoped must be re-read, not just re-pointed.
- **Two databases move, not three.** Hub (new tables) and bizops (write path).
  CaptureOS needs **no migration at all** — it already stores every identifier
  this design needs.
- **A second NAICS table stays.** bizops keeps its checked-in Census table (a
  satellite with a runtime dependency on the Hub for a static reference list is
  worse than a duplicated file). CaptureOS keeps its curated one. The Hub stores
  **codes only** — never titles — so a NAICS revision cannot strand a stale title
  in three places. Both consumers look titles up locally.

### Risks

- ~~**The backfill is the dangerous step.**~~ **Eliminated.** The email-matched
  backfill this ADR originally specified — with its approval file, its inexact
  match warnings, and its ability to attach the wrong person's clearance — does
  not exist, because the Clerk id made it unnecessary. The safest handling of a
  dangerous step is not to have one.
- **Clobbering curation is the quiet one.** CaptureOS's NAICS registry encodes
  judgement a resume cannot: *why* a code fits, whether it is primary or
  secondary, and who it routes to. A sync that treats `founder_naics_matrix` as
  a destination to overwrite would trade that for an LLM's read of a PDF, and
  the loss would be invisible until routing quietly stopped matching. Hence
  additive-on-the-join, above.
- **`capture.*` is unregistered.** Entitlement checks cannot gate what the
  AppRegistry does not know about. Registering CaptureOS is a prerequisite for
  per-org visibility to mean anything.
- **The Suite defines no `org:govcon:profile:*` permissions** (see the
  entitlement gap below). Until it does, profile reads cannot be governed from
  the Hub.

## Plan

Each phase is one PR, reviewable and independently revertible.

| # | Repo | Change |
|---|---|---|
| 1 | MacSuite | `MemberCapabilityProfile` + `MemberProfileNaics` models; `GET/PUT /api/hub/profiles/{hubUserId}`, service-token auth; per-org visibility check |
| 2 | MacSuite | `hub-client` typed wrappers + version bump (TypeScript callers) |
| 3 | bizops | Write-through to the Hub on `applyResumeProposal` / `saveProfile` / `publishProfile` |
| 4 | MacSuite | `GET /api/hub/profiles/by-clerk/{clerkUserId}` (consumers hold a Clerk id, not a Hub id) |
| 5 | CaptureOS | Sync: `users.clerk_user_id` → Hub profile → `title` / `bio` / `founder_naics_matrix` on `users.founder_id`. **No migration** |
| 6 | MacSuite | Register `capture.mactechsolutionsllc.com` in the AppRegistry |

Phase 1 is a prerequisite for everything else. Phase 6 should land before 5, or
the sync has nothing to gate on. Phase 4 is now a Hub route rather than a
CaptureOS migration — the consumer needs no schema change at all.

## Prerequisites tracked elsewhere

- **Entitlement gap:** `org:govcon:profile:self` / `:profile:manage` exist only in
  bizops. The Suite defines the other 21 `org:govcon:*` permissions, but neither
  role its Clerk sync emits (`customer_admin`, `read_only_user`) carries any of
  them — so bizops access is currently ungovernable from the Hub and is decided
  by a coarse Clerk admin/non-admin split. Profile visibility inherits this
  problem.
- **Unmapped roles:** 13 Suite role keys still resolve to zero bizops permissions.
