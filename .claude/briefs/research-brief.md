# UX Research Brief
Generated: 2026-05-25T10:14:04-07:00
Scope: `/command-center` — the internal MacSuite operator dashboard. Code locus:
- `app/(admin)/command-center/page.tsx` + `layout.tsx` + `_components/*` (12 components)
- `components/command-center/*` (9 components) — pre-Vivid surfaces the page composes
- `components/vivid/*` (7 primitives) — the Vivid design-system primitives
- `components/ai/ask-ai-panel.tsx` — the in-page copilot
- The admin chrome wrapper `components/layout/admin-shell.tsx`

**Out of scope:** the marketing site, the customer-facing `/status` page, AgentOps detail surfaces, per-app investigate pages. The prior brief at `.claude/briefs/archive-pre-cc-overhaul/research-brief.md` covered AgentOps; this brief does not re-tread it.

## 1. Product summary

MacSuite Command Center is the internal operator dashboard for MacTech Suite — the single place a MacTech admin sits to see every app's health, deployment drift, repository activity, agent runs, open risks, traffic anomalies, and incoming approvals correlated across the ecosystem. The user is an operator (Patrick / mactech_admin / support / auditor), not a customer. Critical jobs are: read the morning state, triage what's red, approve queued agent work, and click into the right app/run to act. This is regulated-internal-ops tooling that happens to have been painted with a consumer-product aesthetic over the last three sprints.

## 2. Stack & design system inventory

- **Framework:** Next.js 14 App Router, React 18, Server Components + Server Actions. `/command-center` is `dynamic = "force-dynamic"`.
- **UI library:** shadcn-style hand-rolled primitives in `components/ui/` (Badge, Button, Dialog, Sheet, Alert, Tooltip, etc.) — used everywhere else in admin.
- **Styling:** Tailwind 3, two layered token systems:
  1. Global shadcn-style HSL tokens (`--primary`, `--success`, `--warning`, `--destructive`, …) — used by the rest of admin.
  2. **Vivid** namespace `mt-*` — scoped to `/command-center` only. Defined in `tailwind.config.ts` + sourced from `@mactech-solutions-llc/design-tokens` (sprint 52). Includes `mt-bg / mt-bg-2 / mt-bg-3`, four glass tiers `mt-surface-1..4`, `mt-cyan / mt-violet / mt-magenta / mt-lime / mt-amber / mt-rose`, four text grays, custom radii `mt-1..5`, glass backdrop blur, three accent shadows, four animations (`mt-spin-slow`, `mt-pulse-glow`, `mt-shimmer`, `mt-rise`).
- **Fonts (Vivid only):** Geist (display + UI), Geist Mono (mono), Instrument Serif (italic em-phrase in hero).
- **Existing Vivid primitives (`components/vivid/`):** `VividCard` (glass recipe w/ 6 tones), `VividSectionHeader`, `VividStatCard`, `KineticNumber`, `KineticText`, `Sparkline`, `TiltCard` (±8° parallax), `MagneticButton/Link`.
- **Decorative client components (`/command-center/_components/`):** `CursorSpotlight`, `ParticleTrail` (canvas), `ShortcutsOverlay`, `NewActionSheet`.
- **Data layer:** Prisma + a constellation of service modules in `lib/services/command-center/*` (`command-center-service`, `today-digest-service`, `fix-unhealthy-service`, `ai-ask-service`, plus risk/sidebar-counts). Polling via `LiveReconciliationIndicator` calling `GET /api/command-center/status` every 30s and `router.refresh()` on new ticks.
- **Auth:** Clerk + Suite platform permissions (`COMMAND_CENTER_VIEW`, `COMMAND_CENTER_MANAGE`, `AGENTS_CREATE`, `AGENTS_APPROVE`).
- **Charts:** Recharts (code-split via `BrushableActivityLazy`).
- **Animations / motion:** decorative motion is currently *core to the page*, not optional polish — `ParticleTrail`, `CursorSpotlight`, `TiltCard` ±8°, `MagneticButton/Link`, `KineticNumber` count-up, `KineticText` per-char rise, `mt-spin-slow` brand mark, `mt-pulse-glow` rings on degraded/down nodes and the live indicator, gradient brushstrokes in the hero rule.

## 3. Activity signals (last 60 days)

- **Hot files (whole repo, 60d):** `prisma/schema.prisma` (20), `middleware.ts` (12), `prisma/seed.ts` (11), `components/layout/sidebar.tsx` (11), `lib/env.ts` (10), `app/(admin)/command-center/page.tsx` (8), `lib/permissions.ts` (5), `lib/services/command-center/command-center-service.ts` (5).
- **Command-center-specific recent shape:**
  - Sprint 40 (#95): inline Approve & Execute on `/command-center` — landed the `AwaitingApprovalStrip` + `QuickApproveButton`.
  - Sprint 44 (#99): Vivid v1 — hero, layout aurora, glass cards, brand mark, kinetic text, fonts, cursor spotlight.
  - Sprint 45–49 (f4048d7): full Vivid layer — kinetic numbers, sparklines, 8-tile stat grid, brushable area chart, ecosystem map, tilt cards, magnetic buttons, particle trail, shortcuts overlay.
  - Sprint 50 (#100): per-app Vivid pass + recharts code-split + live reconciliation indicator.
  - Sprint 51 (#101): operator rail (left sidebar #2), unified `New` sheet, entitlement matrix surface.
  - Sprint 52: Vivid tokens migrated out to `@mactech-solutions-llc/design-tokens`.
  - Sprints 53–54: a sibling **`/design`** surface ("Design Surface"). Different route; *not* this scope but indicates an ongoing design-system project. **Architect should confirm whether Vivid is also being consumed by `/design` before deciding to retire any Vivid token.**
- **Active surface areas:** the dashboard has been the project's primary feature surface for 7+ sprints. The aesthetic was *additive* across all of them — none of the sprints subtracted. That is the diagnosis the user is articulating.
- **Team size signal:** 3 humans total (Patrick: 86, WELCOMETOTHETRIBE: 60, bmacdonald417: 14). Single primary author (Patrick) on the Vivid sprints. Tight feedback loop available; no second-pair-of-eyes blocker for an opinionated overhaul.

## 4. User-reported pain points

**The user-reported pain point IS the brief itself (verbatim):**

> "too much noise and lack of linear or clear separation, duplicitive content, entangled, discombobulated — needs a master UI overhaul."

This is direct operator feedback from the only operator of the system (you). It is **high-strength** signal — the operator who built it is telling you the cumulative visual debt has crossed the legibility threshold.

GitHub MCP is connected. Open issues (38): all are governance / infra / auth tasks. **Zero** are tagged or worded around `command-center`, `dashboard`, `ux`, or `design` — confirmed via `gh issue list`. Filtering for "command center / dashboard" returns nothing.

**No `Feedback` / `UserFeedback` table** in `prisma/schema.prisma` (`grep -i feedback prisma/schema.prisma` returns nothing). The closest first-party signal channels are `AuditLog` (captures actions, not friction) and the digest's own activity tables. **Research gap:** if a Vivid-overhaul ships and you want to measure whether the next pass actually helped, add a `Feedback` table with a tiny `Report issue` link in `CCHero` or capture self-reported "I scanned this page; what did I see first?" Loom recordings — there is no in-product signal channel today.

**Inferred-from-code pain points (each one is something the code itself shows, not something a user complained about):**

| Pain point | Source | Strength |
|---|---|---|
| **Three competing background motion systems are mounted globally on every render of `/command-center`.** The layout unconditionally mounts `CursorSpotlight` (mix-blend-screen radial that follows the cursor), `ParticleTrail` (full-window canvas emitting 1–3 colored particles per mousemove frame), and three layered `radial-gradient` auroras + a 32px grid texture, *plus* the aurora gradient on the hero hairline. They are gated on `prefers-reduced-motion`, so power users not on RM see all of them. | `app/(admin)/command-center/layout.tsx:42-69`; `_components/cursor-spotlight.tsx`; `_components/particle-trail.tsx` | **high** (visible without running anything — three independent canvas/DOM effects + four gradients + grid) |
| **The Vivid hero alone uses six distinct visual treatments in one block.** Spinning conic-gradient brand mark, eyebrow mono caption, kinetic-text title with cyan→violet→magenta gradient italic *Instrument Serif* em-phrase, body tagline, three magnetic CTA pills each in its own accent (magenta `New` / cyan `Public status` / violet `AgentOps`), then a gradient hairline rule under the whole thing. The "Live · Xs ago" pill in actions slot is a *seventh* color tone (cyan/amber/rose tri-state). | `_components/cc-hero.tsx:42-110`; `_components/live-reconciliation-indicator.tsx` | high |
| **The same fact is rendered 3–5 times across the page, in 3–5 different visual languages.** "Apps down: N", "1 app down" critical-now strip, the `Down` stat-card in the Vivid grid, the operator-rail "Needs attention" group, the ecosystem-map pulse ring on the down node, the apps table StatusPill row, and the `FixUnhealthyBanner`. All the same underlying fact. Each uses a different tile/badge/dot/halo style. | page.tsx body; `today-digest.tsx:374-455` (CriticalNowStrip); `vivid-stat-grid.tsx:54-138`; `operator-rail.tsx:106-200`; `ecosystem-map.tsx:177-238`; `app-status-table.tsx`; `fix-unhealthy-banner.tsx` | **high (literal duplication)** |
| **The Today digest *contains* its own mini-dashboard** — a "CriticalNowStrip" of 5 metric tiles, then 7 sub-section cards (Deploys / Commits / Failed workflows / Risks opened / Risks resolved / Agent runs / Top noisy traffic). The 8-tile `VividStatGrid` then renders 8 *more* tiles further down the page using the *same* underlying data (deploys/agent runs/risks). Six of those eight stat tiles are duplicate signal. | `components/command-center/today-digest.tsx:374-505`; `_components/vivid-stat-grid.tsx:54-138` | **high (functional duplication)** |
| **Visual mood drift between Vivid-painted and "still on shadcn" sub-surfaces.** Today digest is shadcn (`bg-card/40`, neutral border, no glass) — but it sits inside a *cyan-toned* `VividCard` wrapper. The result is a `card-in-glass-in-glass` triple nesting that loses signal: hairlines compete, padding stacks, focus is unclear. Same drift on `AwaitingApprovalStrip` (`bg-warning/5` warning section *inside* the bare page area), `FixUnhealthyBanner` (`bg-warning/5`), `RiskFeed` (rendered inside a `VividCard tone="rose"` wrapper). | `page.tsx:129-213`; compare `today-digest.tsx:41` (`rounded-lg border border-border bg-card/40`) to its `VividCard tone="cyan"` parent | high |
| **Operator workflow cannot be stated in one sentence.** The page has at least *six* concurrent jobs competing for the operator's first attention: (1) read morning digest, (2) triage critical-now strip, (3) approve awaiting runs, (4) ask AI, (5) read the 8-tile stat grid, (6) scan the brushable activity chart, (7) read the ecosystem map, (8) read the apps table, (9) read the open risks feed. None is visually privileged. The hero says "control plane" but does not name *the action*. | page.tsx top-level structure (9 stacked blocks plus a left rail) | **high** |
| **The operator rail and the apps table show the same apps in two different layouts at the same time.** The rail's "Needs attention" auto-fills with down / degraded / unknown / critical-risk apps (up to 6). The apps table below renders the entire fleet with a `Health` column and `Risks` column. The map renders them a third time as nodes. | `operator-rail.tsx:106-124`; `app-status-table.tsx`; `ecosystem-map.tsx` | high |
| **No clear vertical rhythm — the page is 9 stacked blocks with `space-y-8`, no grouping.** There is no "what's broken right now" zone vs "what happened in the last 24h" zone vs "where to drill in" zone. Just: hero → fix-unhealthy → awaiting → digest (with its own internal mini-dashboard) → ask-AI → vivid stats → brushable activity → ecosystem map → apps+risks → about. The brushable chart and ecosystem map are *centerpiece* surfaces buried below the fold of the fold. | page.tsx:100-253 (the JSX return) | **high** |
| **Mobile: the layout collapses but the noise does not.** Operator rail is `hidden md:block`, fine. But CursorSpotlight + ParticleTrail are `coarse: pointer` gated, also fine. *However*, the hero kinetic-text + magnetic pills + tilt cards do not adapt — they still animate on resize, and on a 375px viewport the three CTA pills wrap to two lines under a 4xl heading. The ecosystem-map SVG forces a 1000×540 viewBox; on narrow viewports the labels collide. The Today-digest's `CriticalNowStrip` is 2-col on mobile (5 items → 3 rows, ugly tail). | layout.tsx; cc-hero.tsx; ecosystem-map.tsx; today-digest.tsx:417 | medium |
| **Action surfaces are surfaced in three places, none canonical.** "New" exists as: (a) the magenta `New` pill in the hero opening the `NewActionSheet` (keystroke `n`), (b) the global Cmd+K palette (sprint 31), (c) the `Sync now` button in hero actions, and per-row "Fire / Approve / Stage" buttons further down. There is no documented "do this first" — every page wants to be the entry point. | `cc-hero.tsx`; `new-action-sheet.tsx`; `sync-now-button.tsx`; in-row buttons throughout | medium |
| **Five concurrent accent colors compete for "urgency."** `mt-cyan`, `mt-violet`, `mt-magenta`, `mt-amber`, `mt-rose` all carry semantic meaning *somewhere* on this page, but the meanings overlap. Cyan = primary, healthy *and* the brand. Violet = activity, AgentOps, *and* the brushable-chart brush. Magenta = the `New` CTA *and* the bottom aurora. Rose = critical *and* the open-risks card tone. Amber = degraded *and* failed workflows *and* the `cron-secret` warning *and* the `stale` indicator. The operator cannot color-prime a fact at a glance. | `tailwind.config.ts` Vivid tokens + every consumer | **high** |
| **Glass-on-glass nesting creates ambiguous focus regions.** `layout.tsx` paints a glass canvas → page wraps content in `space-y-8` glass cards (`bg-mt-surface-1` w/ 24px `backdrop-blur`) → some of those wrap *more* glass cards (e.g. the apps+risks two-up section), → some embed shadcn cards with their own `bg-card/40 border-border` inside (digest). There are surfaces 3-deep with their own borders and shadows. | layout.tsx + vivid-card.tsx (24px blur, 150% saturation, hairline+inner-shadow) + today-digest.tsx | high |
| **`TiltCard` is wrapped around every stat card (8 tiles).** Each tile responds to cursor with ±5° rotation + a soft-light spotlight overlay. The intent is "interactive glass" but the effect on a dense 8-tile grid is that the *whole grid* wobbles as the cursor crosses it. This is exactly the "discombobulated" complaint. | `vivid-stat-card.tsx:93`; `tilt-card.tsx` | **high** |
| **`MagneticButton/Link` on the hero CTAs nudges the click target before you reach it.** Operators reading "View public status" don't expect the link to move. On a regulated-ops dashboard this is anti-pattern — operator confidence drops when chrome is fidgety. | `cc-hero.tsx:77-91`; `magnetic-button.tsx` | medium |
| **`KineticNumber` re-animates on every `router.refresh()`.** The live indicator polls every 30s; on every change (a deploy lands, a risk opens) the page refreshes, and the eight stat tiles all count up again. Big numbers redrawn from old → new draws the eye to *every* tile, not the one that changed. | `live-reconciliation-indicator.tsx:103-110`; `vivid-stat-card.tsx`; `kinetic-number.tsx` | **high** (this is "noise as a feature") |
| **Ecosystem map labels collide on narrow viewports and link hit-targets are tiny.** Two concentric rings (inner radius 150, outer 240) over a 1000×540 viewBox. Each node has a 5×5 invisible link box. On a 1280-wide viewport with 15 apps on the outer ring the labels overlap; on mobile they ignore the layout entirely. | `ecosystem-map.tsx:55-300` | medium |
| **Cursor spotlight uses `mix-blend-mode: screen` over near-black; it BRIGHTENS body text under the cursor.** Operator scanning a long row brightens the text under their pointer; reading concentration suffers. | `cursor-spotlight.tsx:55-65` | medium |
| **Particle trail emits up to 3 particles per mousemove frame for ~500ms at 64-particle pool.** Continuous canvas redraw on every move. Battery + GPU cost on laptops; visual "smoke trail" follows the operator at all times. | `particle-trail.tsx` | **high** (decorative cost without function) |
| **The "About the Command Center" footer is a redundant 200-word marketing paragraph.** It restates the tagline and exists on the surface the operator looks at hundreds of times. Operators do not need a re-introduction every visit. | `page.tsx:215-249` | medium |
| **`AskAIPanel` is a primary capability rendered as one of nine equal blocks.** AI is a strategic differentiator and a central job (the operator copilot was sprint 8 onward) but on the dashboard it competes for vertical real estate against decorative widgets. | `page.tsx:138-155` | medium |

## 5. Inferred user & critical path

- **Primary user persona (high confidence — same operator persona as the prior brief, this surface specifically):** internal MacTech admin. Technical. Pattern-fluent. Audit-conscious. Will read everything but should not have to. Lives on this page first thing every morning and again whenever the live indicator says something changed. Probably runs a 14–16" laptop (1440–1920 wide), occasionally checks on phone.
- **Top jobs-to-be-done (ranked):**
  1. **Triage:** in the first 5 seconds, "is anything red right now?" — apps down, criticals open, deploys failed, runs awaiting *my* approval. If yes, which?
  2. **Approve / act:** approve an awaiting agent run (Quick Approve), stage a fix-unhealthy run, follow a deep link into a failing app or risk.
  3. **Read the digest:** "what happened in the last 24 hours?" — deploys, commits, failures, risks opened, risks resolved, agent runs.
  4. **Ask the copilot:** "summarize this", "draft a status email", "what should I look at first?"
  5. **Drill in:** click an app to investigate, click a risk to escalate, click a run to review.
- **Critical path (job #1, triage):** sign in (Clerk, gated) → land on `/command-center` → scan something that tells me what is broken → click into it. **Today, step 3 takes longer than it should because there are 9 stacked blocks with no priority.** The `FixUnhealthyBanner` + `AwaitingApprovalStrip` are conditional (hidden when empty) and that *is* the closest thing to the right answer — but they sit between the hero and the digest, and the same fact ("3 apps down") also appears in the digest's strip, in the stat grid, in the rail, in the map, and in the apps table.
- **Friction points observed in code:**
  - **No "primary" visual.** Every card wants equal weight. The page assumes the operator will read top-to-bottom; the operator scans.
  - **Animation is uncorrelated with state change.** The live indicator triggers a `router.refresh()` which re-kinetic-numbers every tile — even tiles whose value didn't change. The operator's eye is yanked to motion that doesn't mean anything.
  - **Affordance for "fix this now" lives in the digest sub-card.** `CriticalNowStrip` items are clickable but their hit target is a sub-card inside the larger Today card — three click depths from the page's primary CTA region.
  - **The `Sync now` button is gated on `COMMAND_CENTER_MANAGE` but no help text explains what "syncing" does.** Operators without the permission don't see it, so they can't ask. Operators with it click it and… something happens server-side. The reconciliation indicator next to it is the only feedback channel.
  - **No TODO/FIXME breadcrumbs.** Grep `TODO\|FIXME` across the directory returns nothing in scope — the code is clean. The diagnosis is *accretion*, not bugs.

## 6. Recommended aesthetic direction

**Direction: Linear-adjacent operations console with restrained Vivid accents. Dark, dense, single-accent, motion-as-signal-only.**

This is *not* the existing Vivid posture. Vivid as built is "Stream OS" — consumer-product, decorative, multi-accent, particles-and-spotlight. The user's complaint is precisely that this aesthetic is wrong for the job-to-be-done. The architect should **rebase Vivid's posture toward operations-tooling restraint** while keeping the tokens.

**Rationale:**
1. The product is a regulated-internal-ops console. The operator's job is triage and approval against an immutable audit trail. Decorative motion that doesn't correlate with state change is friction, not delight.
2. The Vivid token system is *already capable* of restraint — the same `mt-bg`, `mt-surface-1..4`, `mt-text`, `mt-cyan/violet/magenta/amber/rose/lime` set can be composed Linear-style: one accent per page, color reserved for state, glass demoted from "the look" to "the surface separator."
3. The team is one person plus light collaborators. Maintainability matters: nine motion systems × three accent gradients × glass-on-glass nesting is hard to evolve. Pruning to a single visual rhythm makes the next ten sprints cheaper.
4. Linear (and adjacent tools — Vercel, Plain, Height, Coda admin) are the right reference. They are dark, they are dense, they have accents (one per affordance class), but they do not particle-trail, they do not magnet-pull, they do not tilt, they do not kinetic-count on every refresh.

**Visual language specifics:**
- **Color foundation:** keep `mt-bg`, `mt-bg-2`, `mt-bg-3`, `mt-surface-1` only (drop `mt-surface-2..4` from layout-level use; reserve for hover/active states inside affordances). Pick **one** primary accent for the page (recommend `mt-cyan`). Use `mt-amber` for warning state (degraded/awaiting), `mt-rose` for critical/destructive only, `mt-lime` for healthy/passed, `mt-violet` for AgentOps-specific surfaces only. Retire `mt-magenta` from this page (move it to the public `/status` page where consumer warmth is fine).
- **Typography character:** keep Geist + Geist Mono. **Drop Instrument Serif italic from the hero** — the gradient italic em-phrase is the single loudest thing on the page and does nothing the title text itself doesn't. Replace the kinetic per-character animation with a static heading.
- **Density:** stay dense. Section margins `space-y-4` inside cards, `space-y-6` between top-level zones (down from `space-y-8`). Group the page into **three zones** with explicit headings (see Leverage Point #1): "What needs attention now" / "Last 24 hours" / "Fleet + risks."
- **Motion posture:** retain *exactly* three motion uses: (a) `mt-pulse-glow` on alerting dots (down/degraded/critical), (b) `KineticNumber` count-up only on first paint and only on tiles whose value *actually changed* since last poll (require diff-aware update), (c) the spinner inside long-running buttons. **Remove** `CursorSpotlight`, `ParticleTrail`, `TiltCard`, `MagneticButton/Link`, `KineticText`, the spinning brand mark, the aurora gradient on the hairline, and the three-radial-gradient aurora background. Replace the aurora background with a single quiet linear gradient (`#06070C` → `#0A0C14` top-to-bottom).
- **Glass posture:** glass becomes a *surface* primitive — used to separate a card from the page, never two glass surfaces nested. Cap glass nesting at depth 1. Inner sub-cards drop the blur and use a flat `bg-mt-bg-2` instead.
- **Iconography:** continue with `lucide-react` everywhere. No glyph swaps required.

**What to AVOID for this product:**
- Particle systems of any kind. (Battery cost + zero signal.)
- Cursor-tracking effects (spotlight, parallax tilt, magnetic pull). They actively reduce operator confidence; the chrome should hold still.
- Gradients used as *containers* (the cyan→violet→magenta italic em-phrase, the gradient hero rule, the brand-mark conic gradient). Gradients are reserved for sparkline trails *only*.
- Adding any new accent color. The five-color rose+amber+violet+magenta+cyan war is already the problem.
- Animating "the whole grid count-up on poll." Animate only diffs.
- Re-introducing decorative motion to the public `/status` page. (Out of scope, but flagging — `/status` and `/command-center` should diverge.)
- Skeleton shimmer. The existing `Loader2` spinner is the convention.
- "Friendly" empty-state illustrations. Lucide glyph + sentence + CTA, that is the pattern.

## 7. Top UX leverage points (ranked by impact / effort)

Ranked strictly by what changes the operator's experience the most per unit of work. The architect should attack 1–5 in the primary pass and treat 6–10 as in-scope sweeteners only if they share files with 1–5.

1. **Reorganize the page into three named zones with strict priority.** This is the single biggest lever. Replace the current 9-block vertical stack with: **Zone A — "Right now"** (full-width, top, hairlined-cyan): live indicator + sync action + a single consolidated "Attention" rail combining `FixUnhealthyBanner` + `AwaitingApprovalStrip` + `CriticalNowStrip` items — *one* surface that lists everything red with inline Approve / Stage / Open actions. **Zone B — "Last 24 hours"** (full-width, middle, neutral): the brushable activity chart as the primary widget (it is the digest summarized into one image), with the digest's 7 sub-sections collapsible underneath. Drop the separate 8-tile stat grid; promote 3–4 tiles ("Apps Up/Down/Degraded", "Critical risks", "Failed deploys 24h", "Refused agent runs") to a *single inline row* of count chips on the Zone B header. **Zone C — "Drill in"** (two-up grid): apps table left, open risks right. Add jump-anchors so `Cmd+K` / `g` shortcuts can land on each zone.
   - Problem: 9 equal blocks, no priority, same fact in 3–5 places.
   - Evidence: page.tsx body; today-digest.tsx; vivid-stat-grid.tsx; operator-rail.tsx; ecosystem-map.tsx.
   - Proposed direction: above. Net: page goes from 9 blocks to 3 zones + a footer. Operator can answer "what needs me?" in <5s.
   - Impact: **high**
   - Effort: **L** (touches `page.tsx` extensively; reshapes `TodayDigestCard` to be collapsible; merges three "attention" surfaces into one; deletes the 8-tile grid)

2. **Remove decorative motion. All of it. Then add three motion uses back, deliberately.** Delete `ParticleTrail`, `CursorSpotlight`, `TiltCard` (and unwrap `VividStatCard` from it), `MagneticButton`/`MagneticLink` (replace with normal `<button>`/`<Link>`), `KineticText` (replace with static `<span>`), the spinning conic-gradient brand mark (replace with a static SVG mark or a small Compass glyph). Retain `mt-pulse-glow` on degraded/down indicators and `KineticNumber` *only on tiles whose value changed since the last poll* (requires comparing previous/next value in the parent; a `<KineticNumber animate=false>` escape hatch is enough). Replace the three-radial aurora + 32px grid texture with a single static linear gradient.
   - Problem: animation that doesn't correlate with state is noise. The page has six concurrent motion systems.
   - Evidence: `layout.tsx:42-69`, `_components/cursor-spotlight.tsx`, `_components/particle-trail.tsx`, `_components/vivid-stat-card.tsx:93`, `_components/tilt-card.tsx`, `_components/magnetic-button.tsx`, `_components/cc-hero.tsx:120-141`.
   - Proposed direction: deletions above. Net visual debt drop is enormous; bundle drops too. Keep the *file* `tilt-card.tsx` etc. only if you intend to revive it; otherwise delete and reclaim the import surface.
   - Impact: **high**
   - Effort: **M** (delete + replace at every site; no new logic)

3. **Consolidate "Attention" into one decisive widget.** Today `FixUnhealthyBanner` (warning yellow), `AwaitingApprovalStrip` (warning yellow), and the digest's `CriticalNowStrip` (red items with a green border, 5 tiles) are three separate surfaces telling overlapping stories. Merge them into a single **`AttentionRail`** (Zone A, top of page) with three row-types: **Action-required** (awaiting approval, fix-unhealthy candidate), **Critical-now** (criticals open, apps down, failed deploys 24h, refused runs 24h), **Quiet status** (live indicator, last reconciled, sync action). Inline Quick Approve / Stage Run / Open-app actions on each row. When all three are empty, render one short "All clear · last reconciled 1m ago" pill — *not* a 200-word marketing paragraph.
   - Problem: same facts, three visual languages, three places on the page.
   - Evidence: `awaiting-approval-strip.tsx`, `fix-unhealthy-banner.tsx`, `today-digest.tsx:374-455`.
   - Proposed direction: merge. Use one shadcn-style `Alert`-shaped container per row-type with strict color semantics: amber for action-required, rose for critical-now, neutral for quiet. No `bg-warning/5` glass on the page background — that color is reserved for the row tone.
   - Impact: **high**
   - Effort: **M**

4. **Strict color semantics — one accent per affordance class, retire `mt-magenta` from this page.** Today five accents fight for "urgent." Lock the system to: **cyan** = brand + primary CTA + healthy. **lime** = success / passed. **amber** = warning / degraded / action-needed. **rose** = critical / destructive. **violet** = AgentOps-specific (badges, AskAI panel border, the brushable chart's `agentRuns` series). Move `magenta` out of this page entirely (it lives on `/status` if you want it). Audit and rewrite every accent usage in `_components/` and `components/command-center/` to fit. The `New` pill becomes cyan; the open-risks card stays rose; the brushable chart drops magenta from the legend (it never had it, good); the hero hairline becomes a flat `border-mt-hairline` (no gradient).
   - Problem: color-priming is broken — operator cannot tell at a glance what a color "means."
   - Evidence: `cc-hero.tsx` (magenta/cyan/violet pills), `live-reconciliation-indicator.tsx` (cyan/amber/rose), `brushable-activity.tsx:47-52` (cyan/violet/rose/amber), `today-digest.tsx` (warning/destructive/success mixed with mt-* tokens via parent VividCard tones).
   - Proposed direction: above. Add a one-page color-semantics legend in `docs/COMMAND_CENTER_UI.md` so the next contributor doesn't relapse.
   - Impact: **high**
   - Effort: **M** (mechanical sweep)

5. **Cap glass-nesting depth at 1. Drop blur where it isn't load-bearing.** Layout paints glass; one card per zone may be glass; *inside* a card, sub-cards switch to flat `bg-mt-bg-2 border-mt-hairline` (no `backdrop-filter`, no `shadow-mt-glass`). The Today digest's inner `<Section>` cards (currently `bg-card/40`) become flat-on-flat with one hairline divider, matching Linear's "list of grouped items" pattern. Drops backdrop-filter draw cost and visually flattens the page rhythm.
   - Problem: glass-on-glass-on-glass loses focus and costs GPU.
   - Evidence: `vivid-card.tsx:78-95` (24px blur + 150% saturation), `today-digest.tsx:41` (card-in-glass), `page.tsx:191-213` (two-up grid of VividCards inside a section inside the page glass).
   - Proposed direction: above. Edit `VividCard` to accept a `flat` prop that drops the backdrop filter for non-top-level cards.
   - Impact: medium-high
   - Effort: S

6. **`KineticNumber` re-animates only when its value changes.** Current behavior: any `router.refresh()` re-mounts the page; every tile counts up regardless. Fix: track previous value in component-local state (or compare prev/next props via `useRef`) and short-circuit the animation when they are equal. Two-line change.
   - Problem: live polling makes the *whole page* twitch every 30s.
   - Evidence: `kinetic-number.tsx` (count-up runs on every value-prop change, which is *every render* because the parent recomputes from server data); `live-reconciliation-indicator.tsx:103-110` (calls `router.refresh()` on every newer-than-last timestamp).
   - Proposed direction: add `if (prev === value) return value;` short-circuit at the top of the rAF loop. Possibly also throttle `router.refresh()` to only fire when an *interesting* delta is present (digest activity > 0, or any health flip), not just when `lastReconciliationAt` changes.
   - Impact: medium-high
   - Effort: S

7. **Demote the ecosystem map (or remove it).** It is gorgeous and it is the wrong tool for triage. A constellation of dots tells you "there are apps with degraded health" but it does not tell you *which* faster than the apps table next to it. Two options: (a) **demote** — move the map below the apps table, collapsed by default with a "Show ecosystem map" disclosure for operators who like the spatial mental model; (b) **remove** from the command center and surface it on a dedicated `/admin/ecosystem` route. Recommend (a) for the first pass.
   - Problem: large vertical real estate; redundant with the apps table; mobile-broken.
   - Evidence: `_components/ecosystem-map.tsx` (1000×540 viewBox, two concentric rings, animated pulse rings on degraded/down).
   - Proposed direction: option (a). Keep the file, render inside a `<details>` disclosure with a one-line summary ("11 apps · 1 down · 2 degraded · open map").
   - Impact: medium
   - Effort: S

8. **Replace the hero with a quiet two-row header.** Top row: brand mark (static, not spinning conic) + eyebrow ("MacTech Suite · Command Center") + live-indicator pill + `Sync now` button (when permitted) + `New` button + `?` shortcut hint. Second row: a single sentence — "All clear" / "3 things need you" / "1 critical risk open" — derived from the AttentionRail state. No tagline, no italic em-phrase, no gradient hairline, no three competing CTA pills. The CTAs move to a strict order: `Sync now` (primary, when permitted) → `New` (secondary) → `Public status` / `AgentOps` (tertiary text links, no pill chrome).
   - Problem: the hero is the loudest thing on the page and conveys zero state.
   - Evidence: `cc-hero.tsx` (6 visual treatments in one block, KineticText animation, gradient italic em-phrase, three accent pills with magnetic effect).
   - Proposed direction: above. Drop the tagline; it lives in the About card already. Drop the KineticText; static heading. Drop the magnetic-pull on the pills; they are buttons.
   - Impact: medium-high
   - Effort: M

9. **Mobile pass: hero / pills / digest strip / map all reflow correctly at 375px.** Hero CTAs become a horizontal `overflow-x-auto` strip (or stack 1-per-line, your call) without wrapping a 4xl heading. Digest's `CriticalNowStrip` uses `grid-cols-2 md:grid-cols-3 lg:grid-cols-5` with `grid-flow-row-dense` so the 5-item tail doesn't make an orphan. Ecosystem map (if kept) drops to a list view below 768px. Operator rail is already mobile-hidden — confirm.
   - Problem: page is laptop-first only; the operator-on-phone case breaks.
   - Evidence: `cc-hero.tsx`, `today-digest.tsx:417`, `ecosystem-map.tsx`.
   - Proposed direction: above.
   - Impact: medium
   - Effort: S–M

10. **Remove the "About the Command Center" footer card. Replace with a single quiet link.** It is a 200-word marketing paragraph on a page the operator visits dozens of times daily. Replace with one line in the footer: "Public status → /status · Docs → docs/COMMAND_CENTER.md."
    - Problem: redundant marketing copy on an operations dashboard.
    - Evidence: `page.tsx:215-249`.
    - Proposed direction: above.
    - Impact: low-medium
    - Effort: S

## 8. Out of scope / explicit non-goals

- **Do not touch the data layer.** `lib/services/command-center/*` services, the `getCommandCenterStatus` / `getAppOperationalSnapshots` / `getOpenRiskFlags` / `getTodayDigest` / `getFixableUnhealthyApps` / `emailReady` contracts must stay unchanged. The overhaul is render-side only.
- **Do not touch `prisma/schema.prisma`.** No new tables, no enum changes. (If you later want a `Feedback` table, that is a separate slice — Section 4 already flagged it.)
- **Do not touch `/admin/agents`, `/admin/agents/[id]`, `/admin/agents/triggers*`.** Those received the prior UX pass; the architect should not retouch them. If a component (`run-status-badge.tsx`, `QuickApproveButton`) is shared, treat it as a stable dependency — read-only.
- **Do not touch `/status` (public).** The decorative posture is *correct* for that page (consumer-facing trust signal). Diverging the two surfaces is the goal.
- **Do not touch `/design` (sprints 53–54).** The Design Surface is its own sprint; whatever it consumes from Vivid should keep working. If you propose retiring a Vivid primitive (e.g. `MagneticButton`), grep `app/(admin)/design/` first to confirm zero usage before deleting.
- **Do not touch the `AdminShell` / global sidebar / global topbar.** The "lack of clear separation" complaint is about the page body, not the chrome. The sidebar already has the right semantic structure.
- **Do not introduce a new design-system color token.** Use the eight in `tailwind.config.ts` (`mt-cyan/violet/magenta/lime/amber/rose` + the surface/text grays). The cure for too many accents is *fewer*, not *new*.
- **Do not add a new chart library or visualization type.** Recharts is in, code-split, working — keep it.
- **Do not write a Storybook.** This is a one-page surface; visual review in the browser is sufficient.
- **Do not commit decorative-component-deletion in the same PR as the layout reshuffle if the architect wants to keep PRs reviewable.** Recommend two PRs: (1) "command-center: prune decorative motion + restore color semantics" (leverage points 2, 4, 5, 6, 8, 10), then (2) "command-center: reorganize into three zones" (leverage points 1, 3, 7, 9). The verifier sees a cleaner diff and a clearer success-criteria match per PR.

## 9. Success criteria for the verifier

Binary pass/fail. The verifier runs the dev server (`npm run dev`), signs in, lands on `/command-center`, and checks each item. JSX-level review acceptable where flagged.

**Visual rhythm**
- [ ] The page renders **three clearly labeled zones** ("Right now" / "Last 24 hours" / "Drill in") with an explicit eyebrow heading on each. A user not familiar with the page can name the three zones after 2 seconds of glance.
- [ ] **Above-the-fold content (top 900px at 1440×900) contains the AttentionRail (Zone A) in its entirety and the top of Zone B.** No decorative widget occupies the first 600px alone.
- [ ] The page has **at most 4 top-level sections in the body** (excluding the header bar): AttentionRail, Last-24h, Drill-in, optional Ecosystem-map disclosure. The current 9-block stack is gone.
- [ ] No "About the Command Center" 200-word footer card.

**Motion**
- [ ] **`ParticleTrail` is not rendered.** Grep `<ParticleTrail` in `app/(admin)/command-center/` returns no usages. The file can be deleted or kept as dead code per architect preference, but it MUST NOT be mounted.
- [ ] **`CursorSpotlight` is not rendered.** Same test.
- [ ] **`TiltCard` is not wrapped around any stat card or main-flow surface.** Search `<TiltCard` in `_components/` and `components/` returns zero or only test usages.
- [ ] **`MagneticButton` / `MagneticLink` is not used in the hero or any primary CTA.** The "View public status" / "AgentOps" links are normal `<Link>`s.
- [ ] **`KineticText` is not used in the hero title.** Hero title is a static `<h1>`.
- [ ] **The aurora background is a single static gradient** (one `background-image`, no animated keyframes, no three-radial composition).
- [ ] **The brand mark is static** (no `animate-mt-spin-slow`).
- [ ] **`KineticNumber` does not re-animate on `router.refresh()` when its value is unchanged.** Confirm by opening DevTools, watching the live indicator tick to a fresh timestamp with no real activity, and verifying no tile re-counts.

**Color semantics**
- [ ] No `mt-magenta` in `app/(admin)/command-center/`. (Grep `mt-magenta` returns zero hits in this directory tree, excluding `mt-magenta` token defs in `tailwind.config.ts` and the unused `shadow-mt-magenta`.)
- [ ] Each accent color is used for exactly one semantic role: `mt-cyan` (brand/primary/healthy), `mt-lime` (success/passed), `mt-amber` (warning/degraded/action-needed), `mt-rose` (critical/destructive), `mt-violet` (AgentOps-only). A spot check confirms the apps-down tile, the criticals tile, and the awaiting-approval row all share the same row-tone treatment.
- [ ] Hero hairline is `border-mt-hairline` (or absent), not a cyan→violet→magenta gradient.

**De-duplication**
- [ ] The same fact is rendered at most once on the page. Specifically: "apps down" appears in the AttentionRail row and in the apps table only — not in a dedicated stat tile, not on the ecosystem map (unless that surface is collapsed under a disclosure), not in three places.
- [ ] The 8-tile `VividStatGrid` is removed (or collapsed to ≤4 inline chips in the Zone B header).
- [ ] `FixUnhealthyBanner` + `AwaitingApprovalStrip` + `CriticalNowStrip` are consolidated into one `AttentionRail` surface. Three separate sections do not render simultaneously.

**Glass nesting**
- [ ] No surface has three or more nested `backdrop-filter: blur(...)` containers. (Inspect via DevTools — the layout's glass canvas is depth 1; each VividCard is depth 2; nothing inside a VividCard re-introduces backdrop-filter.)

**Accessibility & motion preferences**
- [ ] `prefers-reduced-motion: reduce` suppresses *all* remaining animations. (Test by toggling the OS setting; KineticNumber jumps, pulse-glow halts, no transforms tween.)
- [ ] All accent-color text on accent-tinted background clears WCAG AA 4.5:1. Spot check: `text-mt-amber` on `bg-mt-amber/10` over `mt-bg`; `text-mt-rose` on `bg-mt-rose/10` over `mt-bg`; `text-mt-cyan` on `bg-mt-cyan/10` over `mt-bg`.
- [ ] Keyboard tab order through the AttentionRail rows hits every actionable item in row order. No focus is trapped or skipped.

**Mobile (375 px viewport)**
- [ ] No horizontal scroll. Hero CTAs stack or scroll within their own row, not the page.
- [ ] AttentionRail tiles are full-width and stack vertically; tap targets ≥ 44px high.
- [ ] If the ecosystem map remains in scope, it is hidden by default below 768px (in a `<details>` or behind a "View" link).

**Page weight / performance (informational, not blocking)**
- [ ] Initial JS bundle for `/command-center` is smaller than before. (Brushable chart is already code-split; deleting `ParticleTrail`, `CursorSpotlight`, `TiltCard`, `MagneticButton` and `KineticText` should shave several KB.)

**Code-organization & non-regression**
- [ ] `lib/services/command-center/*` files have zero diff against `main`.
- [ ] `prisma/schema.prisma` has zero diff.
- [ ] `/admin/agents*` files have zero diff.
- [ ] `/status` route has zero diff.
- [ ] The `LiveReconciliationIndicator`, `SyncNowButton`, `QuickApproveButton`, `RunStatusBadge` surface contracts (prop shapes) are unchanged.
- [ ] `npm run build` succeeds (Next 14 production build with `prisma generate`).

## 10. Open questions for the human

The architect can default the following if no human response is recorded; flagged here in priority order so you can answer fastest.

1. **Vivid retirement scope.** The diagnosis is that Vivid's *posture* (decorative motion, multi-accent, glass-on-glass) is wrong for this page. The tokens themselves (`mt-bg`, `mt-cyan`, …) are good. Do you want the architect to: (a) **rebase Vivid in place** — keep the tokens, prune the components/decorations on `/command-center` (recommended; smallest blast radius), or (b) **fork** — leave Vivid as-is and create a new neutral chrome for `/command-center`, or (c) **kill Vivid** — retire the system entirely and move `/command-center` onto the global shadcn-style chrome the rest of admin uses? Recommendation: (a). But note (a) requires you to be OK with `MagneticButton`, `TiltCard`, `KineticText`, `CursorSpotlight`, `ParticleTrail` being deleted or quarantined to `/design` only.
2. **`/design` route consumption.** Sprints 53–54 shipped a Design Surface at `/design`. Before deleting Vivid primitives, the architect needs to know: does `/design` import any of the decorative components (`TiltCard`, `MagneticButton`, `KineticText`, `ParticleTrail`, `CursorSpotlight`)? If yes, those stay; if no, they can be removed. **You can confirm in 30 seconds with `grep -rln "TiltCard\|MagneticButton\|KineticText\|ParticleTrail\|CursorSpotlight" app/(admin)/design/`.** Default if no response: keep the files (don't delete), just stop mounting them.
3. **Ecosystem map fate.** Demote (collapse under a disclosure) or remove (move to `/admin/ecosystem`)? It is visually striking and you may love it. The leverage-point recommendation is *demote*; flag if you'd rather *remove*.
4. **8-tile stat grid fate.** Recommendation is to delete it and inline 3–4 count chips into the Zone B header. Confirm — or keep it as a Zone B widget (just smaller, and below the brushable chart)?
5. **PR cadence.** Two atomic PRs (motion-prune first, then layout-reshuffle) or one big overhaul PR? Two is cleaner to review and lets you ship the easy win (prune motion) immediately while you think about the layout. Default if no response: two PRs.

If 1 defaults to (a), 2 defaults to keep-files-don't-delete, 3 defaults to demote, 4 defaults to delete, and 5 defaults to two PRs, the architect can proceed without blocking.

## 11. Human responses

Locked in 2026-05-21 by parent session (user delegated to defaults via "wire end to end, lets do it"):

1. **Vivid retirement scope:** (a) **rebase in place** — keep tokens, prune decorative components/decorations on `/command-center`. Decorative components (`TiltCard`, `MagneticButton`, `KineticText`, `ParticleTrail`, `CursorSpotlight`) may be removed from CC imports. Files themselves stay in `components/vivid/` for now (per Q2 default).
2. **`/design` route consumption (resolved by inspection, not human):** `grep -rln "TiltCard\|MagneticButton\|KineticText\|ParticleTrail\|CursorSpotlight" app/(admin)/design/` returned zero matches. `/design` does NOT import any decorative components. Safe to remove them from `/command-center`. The only consumers today are `app/(admin)/command-center/layout.tsx` and `app/(admin)/admin/apps/[appKey]/layout.tsx`. Architect: leave `apps/[appKey]/layout.tsx` alone — that's not in scope.
3. **Ecosystem map:** **demote** under a disclosure. Do not remove yet.
4. **8-tile stat grid:** **delete**. Inline 3–4 count chips into the Zone B header.
5. **PR cadence:** **two atomic PRs**. PR #1 = motion / decoration prune. PR #2 = layout reshuffle (zones, AttentionRail, stat-grid deletion). Architect should produce both in a single change-log but commit them separately if practical.
