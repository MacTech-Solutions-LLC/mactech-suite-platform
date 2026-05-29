# UX Research Brief
Generated: 2026-05-08T16:54:23-07:00
Scope: AgentOps surfaces shipped in slices 5–5.8.
- `/admin/agents` (list + IntentBuilder + ClaudeToolSpec)
- `/admin/agents/[id]` (run detail with declared intent + invariant outcomes + refusal banner)
- `/admin/agents/triggers` (list with row actions)
- `/admin/agents/triggers/new` and `/[id]/edit` (TriggerForm)

## 1. Product summary
MacTech Suite Command Center is an internal-only, MacTech-admin-facing operations console that runs the MacTech app ecosystem (capture, codex, training, QMS, governance, vault, clearD…). AgentOps is its newest capability: an IBE-gated agent runtime that lets admins issue natural-language requests, declare a goal + scope + invariants ("Intent"), and either auto-execute read-only plans or queue write plans for a second-admin approval. Slice 5.7 added M2M (Claude API) trigger; Slice 5.8 added cron-scheduled triggers — same orchestrator, three different requester identities. The brand voice is regulated/operational, not consumer.

## 2. Stack & design system inventory
- **Framework:** Next.js 14 App Router, React 18, server components + server actions, all admin pages `dynamic = "force-dynamic"`.
- **UI library:** shadcn-style hand-rolled primitives in `components/ui/` (`Button`, `Badge`, `Alert`, `Card`, `Dialog`, `Sheet`, `DropdownMenu`, `Select`, `Tabs`, `Tooltip`, `Toast`, `Switch`, `Checkbox`, `StatusBadge`, `StatusPill`, `SeverityBadge`, `RiskBadge`).
- **Styling:** Tailwind CSS 3, CSS-variable-driven theme (`hsl(var(--…))`), dark mode via `class` strategy. Light + dark token sets defined in `app/globals.css`. Primary in light mode is `217 91% 60%` (royal blue); in dark `199 89% 56%` (cyan). Warning is a desaturated amber (`38 92% 50%`); destructive is red `0 84% 60%`. Semantic `success`/`warning` foreground colors hardcode HSL into the badge variants for legibility on tinted backgrounds.
- **Existing primitives that ARE NOT being used by AgentOps surfaces:**
  - `Alert` + `AlertTitle` + `AlertDescription` (the agent pages roll their own warning panels with bare divs).
  - `Tooltip` (the trigger-row action buttons rely on the native `title` attribute, which isn't keyboard-discoverable).
  - `Checkbox` (the IntentBuilder + TriggerForm use raw `<input type="checkbox" />`).
  - `DropdownMenu` (the trigger-row actions render four separate icon `<button>`s instead of grouping into a "More actions" menu).
- **Existing design tokens:** `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--success`, `--warning`, `--border`, `--input`, `--ring`, `--radius` (0.5rem). `font-sans` resolves to a system stack; `font-mono` to SFMono/Menlo. `grid-bg` utility exists for hero sections.
- **Icons:** `lucide-react` 1.11.0 (already imported on every agent page).
- **Design-system gap relevant to this PR:** there is no `Chip` / `Pill` primitive. Both IntentBuilder and TriggerForm hand-roll `rounded-full border px-2 py-0.5` chips with subtly different class strings.

## 3. Activity signals (last 60 days)
- **Hot files (the AgentOps stack is essentially the only thing being built right now):**
  - `lib/agents/orchestrator.ts` (3 touches), `app/(admin)/admin/agents/page.tsx` (3), `app/(admin)/admin/agents/[id]/page.tsx` (3), `app/api/agents/plan/route.ts` (2), every other agent file 1.
  - The whole `components/agents/*` tree was created in the last 5 PRs (#46–#50) — it is brand new code, not a legacy redesign.
- **Active surface areas:** every PR in the window touches AgentOps. Slice 5 (#46) shipped the runtime, 5.5 (#47) shipped IBE gates and `IntentBuilder`, 5.7 (#48) shipped `ClaudeToolSpec` + M2M trigger, 5.8 (#49) shipped `TriggerForm` + triggers list, ops PR (#50) added the GitHub Actions cron tick. No competing "rewrite the agent UI" branch is in flight.
- **Team size signal:** 3 humans across the project lifetime (Patrick: 28, bmacdonald417: 14, WELCOMETOTHETRIBE: 10). All AgentOps work in this window is Patrick's. Small team — the brief should be terse and the PR atomic.
- **The `IntentBuilder` and `TriggerForm` were committed three days apart (5.5 then 5.8). Their visual/structural overlap is a copy-paste artifact — it has not yet had a deduplication pass.**

## 4. User-reported pain points
GitHub MCP is connected. The repo has 38 open issues; **none** are tagged `ux` / `bug` / `design` / `usability`, and none mention `agent` (verified via `gh issue list --search "agent"`). All open issues are platform-governance tasks (auth, secrets, CI, evidence). The AgentOps PRs (#46, #47, #48, #49, #50) all merged within the last 24 hours of the brief timestamp; there has been **zero in-the-wild operator feedback**.

There is **no `Feedback` / `UserFeedback` model** in `prisma/schema.prisma` (verified — 28 models, none feedback-shaped). The closest signal channel is `AuditLog`, which captures actions but not friction.

**All pain points below are inferred from code reading, not user reports.** Each is marked accordingly. This brief should not be treated as user-validated; the polish goal here is internal coherence, accessibility, and operator-clarity, not "fix what users complained about."

| Pain point | Source | Strength |
|---|---|---|
| `IntentBuilder` and `TriggerForm` duplicate ~200 lines of nearly-identical chip pickers, invariant trees, goal validators, and risk-tolerance dropdowns. | code | high (literally side-by-side) |
| `awaiting_approval` and `refused` both render as warning-yellow `Badge` on the run list, despite the AGENT_OPS doc explicitly saying "Surface them differently in the UI; they tell different stories about what to do next." | `docs/AGENT_OPS.md` lines 84–87 vs `app/(admin)/admin/agents/page.tsx` `StatusBadge` and `app/(admin)/admin/agents/triggers/page.tsx` `RunStatusBadge` | **high (doc-stated requirement, code violates it)** |
| Approval-required vs read-only plan steps on `/admin/agents/[id]` distinguish via a single `Lock` (warning) / `Unlock` (muted) icon — no text label, no chip, no color band. Easy to miss when scanning a 7-step plan. | `app/(admin)/admin/agents/[id]/page.tsx` lines 221–228 | inferred (medium — operator scan task) |
| Chip pickers (apps, repos, invariant categories, templates, cron presets) are `<button>` with `transition-colors` only — no `focus-visible:ring-*`. Keyboard users cannot tell what is focused. | `components/agents/intent-builder.tsx` lines 305-315, 376-410, 419-426; `components/agents/trigger-form.tsx` lines 366-376, 491-525 | high (a11y regression, easy to verify with Tab) |
| Trigger row "Fire / Toggle / Edit / Delete" are 4 same-size icon buttons in a tight row, all with hover-only-`title` tooltips. The destructive (Delete) action sits flush against the navigational (Edit) link with no visual separation. | `components/agents/trigger-row-actions.tsx` lines 90–142 | inferred (medium — destructive proximity to nav is a known footgun) |
| The CRON_SECRET-not-configured banner sits inside the page, below `PageHeader`, in the same warning-yellow as run-status badges and the "stuck trigger" badge — operators have to read the text to know which thing is broken. | `app/(admin)/admin/agents/triggers/page.tsx` lines 53–68 | inferred (medium) |
| The empty state on `/admin/agents/triggers` says "No scheduled triggers yet" — but does not link to "New trigger" inline; the action is in `PageHeader` 200px away. The empty state on `/admin/agents` (no runs) similarly has no CTA — it just says "Type a request above." | `app/(admin)/admin/agents/triggers/page.tsx` lines 74–84 and `app/(admin)/admin/agents/page.tsx` lines 67–71 | inferred (medium) |
| The M2M-triggered pill on `/admin/agents/[id]` lives in the `PageHeader` `actions` slot, next to the run status — it is small (10px text), uses `KeyRound`, and is structurally indistinguishable from the run status badge to a glancing eye. The corresponding "Triggered via API key" Tile in the row below has redundant value. | `app/(admin)/admin/agents/[id]/page.tsx` lines 71–80, 85–93 | inferred (low — works, but loud + duplicated) |
| The IntentBuilder declares 5 starter Templates; the TriggerForm has none, even though "save my common intent" is the *primary* trigger use case. | `components/agents/intent-builder.tsx` lines 62–88 vs absence in `trigger-form.tsx` | inferred (medium) |
| The "intentInvariantsJson" `<details>` block on the run detail page is rendered as raw JSON — the user already declared the invariants by friendly label in the IntentBuilder, but on replay they only see machine keys. | `app/(admin)/admin/agents/[id]/page.tsx` lines 161–169 | inferred (low) |

**Research gap to flag for the human:** if/when AgentOps ships to operators, add a `Feedback` table or a Linear/issue intake explicitly tagged `ux:agentops` so the next polish pass has real signal. There is none today.

## 5. Inferred user & critical path
- **Primary user persona (high confidence from code + docs):** internal MacTech admin, holding `mactech_super_admin` / `mactech_admin` / `mactech_support` platform role. Technical (reads JSON, knows what cron is, comfortable with `Bearer $TOKEN`). Compliance-aware. Auditor-replayable workflows are a hard requirement, not nice-to-have.
- **Top 3 jobs-to-be-done:**
  1. **Run a one-off agent query** — "summarize every open risk by severity," see the answer (or the refusal) without leaving the console.
  2. **Approve another admin's queued write plan** — separation-of-duties is enforced server-side; the UI's job is to make the approval decision fast and correct.
  3. **Schedule a recurring IBE-gated query** — set up "nightly sweep at 06:00 UTC" once, then it just runs; check on it occasionally; intervene when it gets stuck (`consecutiveFailures ≥ 3`).
- **Critical path for #1 (browser → run):** sign in (Clerk) → `/admin/agents` → fill `IntentBuilder` (goal, optional scope, invariant checkboxes, risk tolerance) → "Plan with this intent" → redirect to `/admin/agents/[id]` → read plan summary, declared intent, step list → if read-only, see completed result and any artifacts; if write, click Approve/Reject (or hand off to a peer admin).
- **Critical path for #3 (cron):** sign in → `/admin/agents/triggers` → "New trigger" → fill `TriggerForm` (cron preset, name, then *the same Intent UI from path #1*) → save → return to list → on first scheduled fire, click into the linked run → verify the cron-generated run completed clean.
- **Friction points observed in code:**
  - **The hand-off from list to detail loses context.** `/admin/agents` shows status, request text, and step count; `/admin/agents/[id]` re-renders all of that *plus* the declared intent block, three tiles, and approval state. No skeleton or breadcrumb specifically marks "this run is the one you just kicked off."
  - **Errors are surfaced as machine-shaped strings.** `submitError` in IntentBuilder, TriggerForm, RunActions, and TriggerRowActions all render the raw `error` slug (`"plan_failed"`, `"toggle_failed"`, `"missing_required_fields"`, `"cron_invalid"`) in `font-mono text-destructive`. Operators have to mentally translate.
  - **The `Refused — IBE invariant violation` banner on the detail page is informationally rich (it explains what failed) but offers no next-step CTA — no "loosen tolerance to moderate," no "edit declared invariants," no "re-plan."** The dead end is a designed-in dead end (refused is terminal), but the operator has no escape route in the UI; they have to mentally back-navigate and rebuild the request.
  - **The TriggerForm's "submit disabled" rule is `saving || cronError || !name.trim() || !request.trim() || !goalValid`.** When the button is disabled, there is no inline list of *which* condition is failing — the operator has to scan the whole form for the offending field.
  - **TODO/FIXME comments in scope:** zero. The code is clean, just thinly polished.

## 6. Recommended aesthetic direction
- **Direction: Operations / command center, restrained.** Keep the existing dark-tokened, high-density layout. Do **not** introduce glassmorphism, gradients, gloss, or expressive motion. This is regulated-internal-ops tooling running over IBE-gated machinery — the visual job is *legibility under load and unambiguous status semantics*, not delight.
- **Rationale:** the requester is a MacTech admin doing approval work that is captured in an immutable audit log. Aesthetic bling (bold gradients, glow rings) actively hurts: it suggests confidence that hasn't been earned by the underlying decision (read-only vs approval-required, refused vs failed). The project's existing tokens already implement the right idea — Linear-adjacent density, monospace for IDs/cron/JSON, semantic color reserved for true state changes. The polish pass should *enforce* that posture, not add a new one.
- **Visual language specifics:**
  - **Color foundation:** keep the four existing tinted-state colors. **Use them more strictly**: `success` only for completed/passed-invariant; `warning` only for awaiting-human (approval); `destructive` only for failed/rejected/cancelled; introduce a fifth visual treatment (border-only, no fill, with a `XOctagon` glyph) for `refused` — it is *not* awaiting-anyone, it is *not* a thrown failure, it is "the contract did not hold."
  - **Typography character:** unchanged. Ensure all chip pickers use `text-xs` (currently mixed `text-[10px]` / `text-[11px]`).
  - **Density:** stay dense. Section margins should be `space-y-4` inside cards, `space-y-6` between sections — already the convention.
  - **Motion posture:** unchanged. Existing `Loader2 animate-spin`, `transition-colors` on hover. Do **not** add scale-on-hover or shadow-pulse animations; they cheapen the audit feel.
- **What to AVOID for this product:**
  - Any color shift beyond the existing token palette (no purple "AI" accents, no neon).
  - Tooltip-only labels on icon buttons (the trigger-row actions today). Operators on accessibility paths cannot read native `title`.
  - Cute empty-state illustrations (Stripe-shaped). The ecosystem is governance/CMMC-adjacent; a smiling robot in `EmptyState` is wrong.
  - Glassmorphism / `backdrop-blur` panels. There's no glass anywhere else in the app.
  - Skeleton shimmer in the loading state — the existing `Loader2` spinner is the convention; introducing shimmer here makes only this surface look different.

## 7. Top UX leverage points (ranked)

Ranked by impact / effort. The architect should attack 1–6 first; 7–10 are sweeteners.

1. **Distinct `refused` visual treatment across all three list pages and the run detail.**
   - Problem: `refused` (IBE invariant violation, contract did not hold) renders identically to `awaiting_approval` (warning yellow). The doc explicitly says they are different. Operators looking at a list can't tell "needs my approval" from "did not run because the invariant tripped" without reading the badge text.
   - Evidence: `docs/AGENT_OPS.md` lines 81–87 ("Surface them differently in the UI"); `app/(admin)/admin/agents/page.tsx:124-143` `StatusBadge`; `app/(admin)/admin/agents/triggers/page.tsx:160-177` `RunStatusBadge`; `app/(admin)/admin/agents/[id]/page.tsx:351-372`. Every one of these dispatches `refused` and `awaiting_approval` to the same `warning` variant.
   - Proposed direction: introduce a sixth `Badge` variant `refused` — outline-only border (`border-warning/60`), no fill, leading `XOctagon` glyph, label `refused`. Apply to every status mapping. On the run detail page, also add a non-warning border-left accent strip on the `Refused — IBE invariant violation` banner so it is structurally distinct from a CRON_SECRET-style warning banner.
   - Impact: high
   - Effort: S

2. **Extract a shared `IntentEditor` component used by both `IntentBuilder` and `TriggerForm`.**
   - Problem: the two components hand-roll the same registry fetch, the same `invariantsByCap` memo, the same scope-app/scope-repo chip rows, the same goal-validation `useEffect`, the same risk-tolerance `<select>`. Bug-fix divergence is already visible: IntentBuilder has a "show all capabilities" toggle, TriggerForm filters to only-with-invariants with no escape hatch.
   - Evidence: `components/agents/intent-builder.tsx` lines 90–522 vs `components/agents/trigger-form.tsx` lines 92–620. Compare lines 376–410 (IntentBuilder scope chips) to lines 491–525 (TriggerForm scope chips) — character-level near-duplicates.
   - Proposed direction: create `components/agents/intent-editor.tsx` exporting `<IntentEditor value={intent} onChange={setIntent} showAllCapabilitiesToggle={true|false} />`. `IntentBuilder` becomes a thin wrapper around `IntentEditor` + Templates + free-text `request` + Plan submit; `TriggerForm` becomes Schedule fields + `IntentEditor` + Save. Shared pieces: registry fetch hook (`useAgentRegistry()`), goal validator hook (`useGoalValidator(goal)`), `<ScopeChips />`, `<InvariantTree />`, `<RiskToleranceSelect />`. Don't expose `IntentEditor` outside this slice — it is internal.
   - Impact: high (every future Intent surface — webhook-shaped triggers in 5.9, threshold triggers — gets it free; invariant-key labels become consistent in one place)
   - Effort: M

3. **Approval-required vs read-only step affordances: chip + color band, not just an icon.**
   - Problem: today, `Lock` (warning-tinted) vs `Unlock` (muted) is the *only* signal that a step is approval-gated. The label `approval_required` itself never appears in the UI. In a 7-step plan with a single write step, the operator can scan past the lock icon and miss that the run will block.
   - Evidence: `app/(admin)/admin/agents/[id]/page.tsx` lines 221–228; `components/agents/intent-builder.tsx` lines 437–446; `components/agents/trigger-form.tsx` lines 540–549.
   - Proposed direction: render each step row with a **left border accent** — `border-l-4 border-warning` for `approval_required`, `border-l-4 border-border` (or transparent) for `read_only`. Inline next to the capability key, render a small `<Badge variant="warning">approval-required</Badge>` for write steps, `<Badge variant="muted">read-only</Badge>` for the rest. Keep the lock icon as the affordance inside the badge, not as the primary signal. Apply identically inside `IntentEditor`'s capability tree and on the run detail step list.
   - Impact: high
   - Effort: S

4. **Accessible focus-visible rings on every chip picker.**
   - Problem: app chips, repo chips, template chips, cron preset chips, invariant capability tree, mode-toggle (curl/python) on `ClaudeToolSpec`, and the "show all capabilities" toggle are all `<button>` with `transition-colors` and zero `focus-visible:*`. Keyboard navigation is invisible. Screen-reader users get nothing extra; the buttons have no `aria-pressed`.
   - Evidence: `components/agents/intent-builder.tsx` lines 305–315, 376–410, 419–426; `components/agents/trigger-form.tsx` lines 366–376, 491–525, 416–433; `components/agents/claude-tool-spec.tsx` lines 112–134.
   - Proposed direction: introduce a single `chipVariants` cva in `components/ui/chip.tsx` with `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` (matches `Button`'s focus story). Variants: `app | repo | template | preset`. Selected state uses `aria-pressed="true"` + the existing `border-primary bg-primary/15 text-primary`. Verify contrast: on dark, `text-primary` (cyan `199 89% 56%`) over `bg-primary/15` is 4.5:1+. Audit while shipping.
   - Impact: high (a11y, applies to ~7 surfaces in this PR)
   - Effort: S

5. **Trigger-row action density: collapse to "primary + overflow," group destructive separately.**
   - Problem: four equal-weight icon buttons (`Play`, `PowerOff/Power`, `Pencil`, `Trash2`) live in a 1px-bordered row with no visual hierarchy. Native `title` only — keyboard / SR users get an unlabeled `<button>`. Delete sits flush against Edit; a misclick destroys the trigger after a single `confirm()` browser dialog.
   - Evidence: `components/agents/trigger-row-actions.tsx` lines 90–142.
   - Proposed direction:
     - Promote `Fire now` to a labeled `<Button size="sm" variant="outline">Fire now</Button>` with the `Play` glyph leading. This is the most-used action; it deserves text.
     - Move `Toggle` (enable/disable) and `Edit` and `Delete` into a `DropdownMenu` (`components/ui/dropdown-menu.tsx` already shipped). Use the radix pattern other admin tables use.
     - Wrap delete in the existing `Dialog` confirm pattern (search the codebase for "Suspend" / "Reactivate" — they use modal confirmations, not `window.confirm`).
     - Add `aria-label` on every icon-only control. Replace `title=""` with `Tooltip` from `components/ui/tooltip.tsx` so keyboard focus shows the label too.
   - Impact: high (destructive proximity is a real footgun; a11y wins; matches the rest of admin)
   - Effort: M

6. **Empty states: explicit primary CTA in the empty container, not just at the page header.**
   - Problem: each of the three list pages has a placeholder, but none of them carry the primary action *inside* the empty state.
     - `/admin/agents` empty: "No agent runs yet. Type a request above to plan one." — no anchor link to the IntentBuilder; if the IntentBuilder is collapsed/scrolled out of view, the operator just sees a dotted box.
     - `/admin/agents/triggers` empty: "No scheduled triggers yet. Create one to fire a saved IBE Intent on a schedule." — sentence ends; no button. The "New trigger" button is in `PageHeader` actions, far away.
     - `/admin/agents/[id]` plan empty (planner couldn't match): "Try wording it more concretely or enable the LLM planner." — no link back.
   - Evidence: `app/(admin)/admin/agents/page.tsx` lines 67–71; `app/(admin)/admin/agents/triggers/page.tsx` lines 74–84; `app/(admin)/admin/agents/[id]/page.tsx` lines 205–209.
   - Proposed direction: standardize an `<EmptyState icon title body action />` pattern (no illustrations — keep the lucide glyph centered; this matches the existing `Sparkles` / `Clock` glyph cadence). On `/admin/agents/triggers` empty, render `<Button asChild><Link href="/admin/agents/triggers/new"><Plus />New trigger</Link></Button>` directly. On `/admin/agents`, render an "Open the planner" anchor that scrolls to the `IntentBuilder`. On the planner-couldn't-match case, add a "Show all 16 capabilities" disclosure that the operator can read for inspiration.
   - Impact: medium-high
   - Effort: S

7. **CRON_SECRET-not-configured banner: promote to `Alert` primitive, distinguish from in-list "stuck" warnings.**
   - Problem: the env-config warning, the per-row "stuck (N failures)" badge, and `awaiting_approval` row badges all use the same `bg-warning/10 border-warning/40 text-warning` recipe. A glance at the page can't disambiguate "the cron pipe is wholesale broken" from "this one trigger has been failing."
   - Evidence: `app/(admin)/admin/agents/triggers/page.tsx` lines 53–68 (banner) vs lines 102–106 (per-row stuck badge) vs the run-status `warning` badges below.
   - Proposed direction: replace the inline div with `<Alert variant="warning"><AlertTriangle /><AlertTitle>CRON_SECRET not configured</AlertTitle><AlertDescription>…</AlertDescription></Alert>`. The existing `Alert` primitive (`components/ui/alert.tsx`) already gives a stronger left-icon + title hierarchy and is keyboard/SR-friendly via `role="alert"`. Differentiate scale: page-level system warnings get `Alert`; per-row state gets the `Badge`. Add a `[Read setup steps]` link on the right of the alert pointing at the relevant section of `docs/AGENT_OPS.md` (or the env table).
   - Impact: medium
   - Effort: S

8. **M2M-triggered pill: relocate from PageHeader actions to a single "source" row in the tile grid.**
   - Problem: the `M2M-triggered` pill on `/admin/agents/[id]` shares the `actions` slot with the run status badge. Visually, the two compete; the pill's primary-tinted styling (`border-primary/30 bg-primary/10`) reads louder than the actual run status. Worse, the very next block re-states the same fact in the first Tile ("Triggered via API key" with the key name as value). Two surfaces, one fact.
   - Evidence: `app/(admin)/admin/agents/[id]/page.tsx` lines 71–80 (PageHeader actions) and lines 84–93 (Tile).
   - Proposed direction: keep only one source-of-truth surface. Drop the PageHeader pill; expand the existing first Tile to be a full "Triggered by" row with three sub-modes (clerk / api-key / cron) keyed off `triggeredByApiKeyId` + the (forthcoming) `requestedByClerkUserId.startsWith("cron:")` predicate. Render the source as a small `Badge variant="outline"` inside the tile next to the value. Page header actions become exclusively the run status badge.
   - Impact: medium
   - Effort: S

9. **TriggerForm: add Templates to match IntentBuilder.**
   - Problem: `IntentBuilder` ships 5 starter Templates; `TriggerForm` does not. But cron is the use case where a template is *most* valuable — operators set up "nightly sweep / weekly drift / hourly health" and rarely customize the goal text.
   - Evidence: `components/agents/intent-builder.tsx` lines 62–88, 299–316; `components/agents/trigger-form.tsx` (no templates).
   - Proposed direction: hoist the `TEMPLATES` array to `lib/agents/intent-templates.ts` (already a candidate for the shared `IntentEditor`). Render them inside `TriggerForm` above the goal field, with one extra tweak: each template carries a *suggested* cron preset (e.g. "Nightly drift sweep" → `0 6 * * *`) so click-to-apply also fills the schedule.
   - Impact: medium
   - Effort: S

10. **Translate machine error slugs to operator-readable copy at the boundary.**
    - Problem: `submitError`, `cronError`, `error` strings render the raw API slug (`plan_failed`, `cron_invalid`, `missing_required_fields`, `registry_load_failed`) in `font-mono text-destructive`. The operator has to mentally translate.
    - Evidence: `components/agents/intent-builder.tsx` line 517; `components/agents/trigger-form.tsx` line 614; `components/agents/run-actions.tsx` line 143; `components/agents/trigger-row-actions.tsx` line 140.
    - Proposed direction: introduce a small `lib/agents/error-copy.ts` lookup mapping known slugs to human strings. Render the human string with the slug in a small mono tail (`Could not save the trigger — registry catalog failed to load. (registry_load_failed)`). Keep the slug for greppability; surface English first.
    - Impact: medium
    - Effort: S

## 8. Out of scope / explicit non-goals
- **Do not touch the orchestrator** (`lib/agents/orchestrator.ts`), the **capability registry** (`lib/agents/capabilities/*`), the **planner** (`lib/agents/planner.ts`), or the **invariant evaluators** (`lib/agents/intent/invariants.ts`). The user has explicitly carved these out — they are intentionally minimal.
- **Do not redesign the IBE doctrine itself** (goal validation rules, scope shape, invariant payload shape). Those are in `lib/agents/intent/validator.ts` and ported from `/Users/patrick/IBE/`. UI must reflect them, not change them.
- **Do not change the `AgentRunStatus` enum** in `prisma/schema.prisma`. The `refused` state already exists; the polish is *visual differentiation*, not new lifecycle states.
- **Do not change API route shapes** under `app/api/agents/*` or `app/api/v1/agents/*`. The Claude tool spec depends on them.
- **Do not introduce a new design-system color token.** Use the five that already exist (`success`, `warning`, `destructive`, `primary`, `muted`). The "refused" treatment is achieved by *composing* `warning` differently (border-only + glyph), not by adding a new color.
- **Do not redesign the sidebar.** "Scheduled Triggers" already has its slot.
- **Do not add an illustration system or shimmer-skeleton.** Existing `Loader2` is the convention.
- **Do not introduce a global `<Chip>` if it grows scope.** Keep `chip.tsx` co-located in `components/ui/` with a single `cva` and the same patterns as `Badge`/`Button`. If a `<Chip>` would force changes outside the AgentOps surfaces, defer it.
- **Do not write or modify tests beyond what compiles.** This codebase has no Vitest/Jest infrastructure (verified — no `test` script in `package.json`); the verification path is `npm run build` + visual review against shadcn-style snapshot expectations.

## 9. Success criteria for the verifier
The verifier should treat each of the following as a binary pass/fail. Anything that needs the auth gate can be confirmed by importing the leaf component into a Storybook-less ad-hoc page or by visual inspection of the JSX (the verifier can read the diff).

**Build / type integrity**
- [ ] `npm run build` succeeds (Next 14 production build with `prisma generate` step). No new TS errors. No new ESLint errors via `npm run lint`.
- [ ] No unused imports remain after the dedup (verifier should grep for `IntentBuilder` and `TriggerForm` and confirm both still render in their respective routes after refactor).

**Visual differentiation: refused vs everything else**
- [ ] On `/admin/agents`, a `refused` run is visually distinct (no fill, has the `XOctagon` glyph, distinct border treatment) from an `awaiting_approval` run (warning fill, no `XOctagon`).
- [ ] On `/admin/agents/triggers`, the same distinction holds for `lastRunStatus = "refused"` vs `"awaiting_approval"`.
- [ ] On `/admin/agents/[id]`, the refusal banner has a distinct left-border accent or color band that does not collide with the cron-secret warning banner.

**Step affordances**
- [ ] On `/admin/agents/[id]`, every step row that is `approval_required` carries both a left-border accent AND a labeled badge containing the words "approval-required". Read-only steps do not carry the accent.
- [ ] The same affordance is consistently applied inside the IntentEditor capability tree (when the operator is declaring invariants, they can see at a glance which capabilities need approval).

**Accessibility of chip pickers**
- [ ] `Tab` to any chip in the IntentEditor (apps, repos, template, cron preset, invariant). The focused chip shows a `ring-2 ring-ring ring-offset-2 ring-offset-background`.
- [ ] Each chip carries `aria-pressed` reflecting its selected state.
- [ ] Contrast ratio ≥ 4.5:1 on selected chip text vs background, verified in dark mode (the default).

**Trigger row actions**
- [ ] "Fire now" is a labeled button (text + glyph), not icon-only.
- [ ] Toggle / Edit / Delete are inside a `DropdownMenu` (or equivalent radix-driven menu) reachable by Enter / Space on the trigger button.
- [ ] Delete confirmation is rendered as a `Dialog`, not `window.confirm()`.
- [ ] Every icon-only control has an `aria-label`.

**CRON_SECRET banner**
- [ ] Rendered with `<Alert variant="warning">`. Does not visually collide with per-row warning badges.

**Empty states**
- [ ] `/admin/agents/triggers` empty state contains a primary `New trigger` button inside the empty container (not 200px away in the page header).
- [ ] `/admin/agents` empty state's CTA copy points the operator at the IntentBuilder (or the IntentBuilder is rendered conditionally inside the empty container).
- [ ] No state shows machine slugs as the only error copy. Each known error slug has a human-readable counterpart from `lib/agents/error-copy.ts`.

**Code-organization**
- [ ] `IntentBuilder` and `TriggerForm` share a `components/agents/intent-editor.tsx` (or equivalent). Diff-grep: line count of both files combined drops by at least 30%.
- [ ] No new global colors added to `tailwind.config.ts` or `app/globals.css`.

**Non-regressions**
- [ ] All existing API contracts (`POST /api/agents/plan`, `POST /api/agents/triggers`, etc.) untouched.
- [ ] `lib/agents/orchestrator.ts`, `lib/agents/planner.ts`, `lib/agents/capabilities/*`, and `lib/agents/intent/invariants.ts` untouched.
- [ ] `prisma/schema.prisma` untouched.
- [ ] PR title is exactly `ux: polish AgentOps surfaces`.
- [ ] PR is a single, atomic commit-set (the user explicitly requested one PR).

**Visual review (since auth gate blocks live screenshots)**
The verifier should not bypass the Clerk gate. Instead, do a JSX-level visual review of the diff against this brief's success criteria. If a snapshot is needed, render the leaf components (`IntentEditor`, `TriggerRowActions`, refusal banner) into a temporary `/dev` route or Storybook-less harness and screenshot from there.

## 10. Open questions for the human
1. Should the "Fire now" promotion in leverage point #5 also apply on the run detail page's `RunActions` (i.e., should "Execute plan" become the primary action and "Approve" become an outline-variant)? The current arrangement has them as same-weight which is *probably* right for awaiting-approval review, but worth a sanity check.
2. For the refused-state treatment in #1, do you want the badge text to change ("refused — invariant" vs just "refused") or keep the label terse and rely on the icon + the detail-page banner for the explanation?
3. There is no `Feedback` or in-product feedback channel today. Do you want this PR to add a thin "Report issue" link in `PageHeader` for the AgentOps pages (a `mailto:` or a GitHub issue template prefill), or is that a separate slice?
4. Should TriggerForm's Templates (#9) include cron presets, or just the Intent body — leaving cron as a separate operator decision? (Defaulted to "include cron" in the leverage point; flag if you'd rather not.)

If these are non-blocking, the architect can proceed with the choices flagged in each leverage point.

## 11. Human responses

User confirmed defaults on all four open questions (2026-05-08):

1. **Run detail action hierarchy:** keep Execute and Approve equal-weight. Approving and executing are distinct decisions; promoting one obscures the other.
2. **Refused badge text:** stay terse — `refused`. Detail-page banner carries the explanation.
3. **Report-issue link in PageHeader:** **defer.** This PR is purely UX polish; feedback intake is its own slice.
4. **TriggerForm templates:** **include cron presets.** Each starter template carries a suggested cron expression so click-to-apply also fills the schedule.

Architect should proceed with the leverage points 1–6 as primary scope; 7–10 as sweeteners if effort permits in a single atomic PR.
