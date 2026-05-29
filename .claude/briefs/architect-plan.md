# Architect Plan
For brief: 2026-05-25T10:14:04-07:00
Iteration: 1

## Strategy: two atomic logical PRs in one agent run

The brief locks PR cadence to "two atomic PRs": (1) motion/decoration prune, (2)
layout reshuffle. We execute both in this run but commit them separately. This
plan covers both.

## PR #1 — Motion + decoration prune + color semantics

### Items addressed
- LP2 — Remove decorative motion (ParticleTrail, CursorSpotlight, TiltCard wrap,
  MagneticButton/Link, KineticText, spinning conic brand mark, 3-radial aurora,
  32px grid texture, gradient hero hairline).
- LP4 — Strict color semantics; retire `mt-magenta` from /command-center.
- LP6 — `KineticNumber` no-op when value unchanged.
- LP8 — Hero quietened (BrandMark static, no KineticText, no magnetic CTAs,
  ordered hierarchy of buttons, no gradient italic em-phrase).

### Files I will touch
- `app/(admin)/command-center/layout.tsx` — drop CursorSpotlight + ParticleTrail
  mounts. Replace 3-radial aurora + grid texture with single static linear
  gradient.
- `app/(admin)/command-center/_components/cc-hero.tsx` — replace `KineticText`
  with static span; replace `MagneticLink` with normal `<Link>`; replace
  spinning conic BrandMark with a static SVG mark (a quiet Compass-styled icon
  in cyan); replace gradient italic em-phrase with sans em-phrase in cyan;
  remove gradient hairline (use border-mt-hairline); recolor `New` pill from
  magenta to cyan; simplify CTA order.
- `app/(admin)/command-center/_components/vivid-stat-grid.tsx` — unwrap
  TiltCard internally by deleting it from VividStatCard. (Component itself is
  used in PR #2 layout reshuffle for inline chips, so we leave the file alone
  here and only touch the underlying card.)
- `components/vivid/vivid-stat-card.tsx` — remove the `<TiltCard>` wrapper.
  (Decorative; the stat card stays glass + accent.)
- `components/vivid/kinetic-number.tsx` — short-circuit when previous value
  equals next.

### New primitives I will create
None for this PR. We're subtracting, not adding.

### Risk of regression
- `KineticText` and `MagneticLink` removal does not change semantics —
  `KineticText` already renders as plain text under reduced-motion;
  `MagneticLink` is `<a href>` underneath. No call-site contracts break.
- The brief explicitly says **do not delete** decorative files (other
  consumers may exist — though grep confirmed `/design` doesn't use them).
  We only stop *importing* them on /command-center.
- `vivid-stat-card.tsx` is consumed by `vivid-stat-grid.tsx` only. Removing
  the `<TiltCard>` wrapper is local; the card visual is unchanged otherwise.
- `KineticNumber`'s short-circuit must preserve the initial paint (when
  display goes from `0` → real value on first mount). We track previous
  *target* value via `useRef`, compare to incoming `value`, and skip raf
  setup when equal.

## PR #2 — Layout reshuffle into three zones

### Items addressed
- LP1 — Three named zones (Right now / Last 24 hours / Drill in).
- LP3 — Consolidate FixUnhealthyBanner + AwaitingApprovalStrip + CriticalNowStrip
  into a single AttentionRail in Zone A.
- LP7 — Demote ecosystem map under a `<details>` disclosure (per locked answer
  #3).
- LP10 — Remove the 200-word "About the Command Center" footer card and
  replace with a one-line link footer.
- LP1 sub-item — Delete the 8-tile VividStatGrid; inline 3–4 count chips on
  the Zone B header (per locked answer #4).

### Files I will touch
- `app/(admin)/command-center/page.tsx` — major reshape into three zones.
- `app/(admin)/command-center/_components/zone-header.tsx` — **NEW** small
  primitive for "Right now / Last 24 hours / Drill in" zone headings.
- `app/(admin)/command-center/_components/attention-rail.tsx` — **NEW** the
  Zone A consolidated widget. Merges FixUnhealthyBanner, AwaitingApprovalStrip,
  and CriticalNowStrip items into a single Alert-shaped surface.
- `app/(admin)/command-center/_components/zone-b-chips.tsx` — **NEW** the
  inline count chips (Apps Up/Down/Degraded, Critical risks, Failed deploys
  24h, Refused agent runs) for the Zone B header.
- `components/command-center/today-digest.tsx` — remove `CriticalNowStrip`
  rendering (now lives in AttentionRail); leave the rest intact.

### New primitives I will create
- `ZoneHeader` — eyebrow + title + optional meta slot. Standardized typography
  for Zone A/B/C dividers.
- `AttentionRail` — three row-types: action-required (amber), critical-now
  (rose), all-clear (neutral). Each row is a tap target with inline action
  buttons (Quick Approve, Stage, Open).
- `ZoneBChips` — server-rendered count chips inline with the Zone B title.

### Files I will NOT touch
- `lib/services/command-center/*` — out of scope per brief Section 8.
- `app/(admin)/admin/apps/[appKey]/layout.tsx` — explicitly off-limits per task.
- `components/command-center/{app-status-table,risk-feed,risk-row-actions,
  sync-now-button,public-status-row,overview-tiles}.tsx` — not flagged.
- `components/vivid/vivid-card.tsx` — `VividCard` is used as a top-level
  surface primitive and the brief's LP5 (glass nesting) is acceptable to defer
  in this pass; we will simply *avoid* nesting glass inside glass at the page
  level. (Deferring full glass-nesting refactor to keep PR scope contained.)

### Risk of regression
- AttentionRail re-implements interaction surfaces (QuickApproveButton, Stage
  button) — we re-use the same `QuickApproveButton` and `stageFixUnhealthyRuns`
  server action so contracts stay identical.
- TodayDigestCard's removal of CriticalNowStrip should not break empty-state
  logic — that strip wasn't required for the card; it was a top-of-card
  affordance. Verified by reading the JSX.
- Apps table + risk feed two-up section is preserved as Zone C.

## Items I am deferring this pass

- **LP5 (glass-nesting cap at 1).** Touching `VividCard` to add a `flat` prop
  would require a sweep of every consumer site to opt in. Out of budget;
  defer to a follow-up. Mitigation: PR #2 keeps the new zones from nesting
  glass inside glass by emitting AttentionRail as a single VividCard and
  inlining sub-rows without backdrop-filter.
- **LP9 (mobile pass).** The operator-rail is already `hidden md:block`, and
  removing decorative motion + collapsing 9 blocks to 3 zones improves mobile
  legibility substantially. A dedicated mobile-only pass (hero CTA reflow,
  ecosystem-map list view, digest grid) is its own pass. Defer.
- **Throttling `router.refresh()` to only fire on interesting deltas.** LP6's
  primary win is the `KineticNumber` short-circuit, which already prevents the
  whole-grid count-up. Throttling the refresh itself requires reasoning about
  what counts as "interesting" in the API response shape — defer.

## Test commands
- `npx tsc --noEmit`
- `npx next lint` on the directory we touched

## Commit cadence
- Commit 1 = PR #1 contents (motion prune + color semantics + KineticNumber
  short-circuit + hero quieted).
- Commit 2 = PR #2 contents (page reshape, AttentionRail, ZoneHeader, chips,
  ecosystem-map disclosure, footer trim, CriticalNowStrip removal from
  TodayDigest).
- Parent session handles actual commits; we leave the working tree staged
  cleanly for them.
