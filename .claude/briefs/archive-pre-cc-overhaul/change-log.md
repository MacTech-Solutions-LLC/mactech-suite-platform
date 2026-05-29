# Change Log
For brief: 2026-05-08T16:54:23-07:00
Iteration: 1
Generated: 2026-05-08T17:42:00-07:00

## Items addressed

All ten leverage points in the brief are addressed in this single atomic change-set.

### Item 1 — Distinct `refused` visual treatment across list pages and run detail
- **Brief reference:** Top UX leverage point #1
- **Files modified:**
  - `components/ui/badge.tsx` (added `refused` variant — outline-only with warning-tinted border)
  - `app/(admin)/admin/agents/page.tsx` (replaced local `StatusBadge` with shared `RunStatusBadge`)
  - `app/(admin)/admin/agents/[id]/page.tsx` (replaced local `StatusBadge`; refusal banner gets a left accent strip + outline-only fill so it cannot be confused with cron-secret warning banners)
  - `app/(admin)/admin/agents/triggers/page.tsx` (replaced local `RunStatusBadge`)
- **Files created:**
  - `components/agents/run-status-badge.tsx` — single source of truth for status → variant mapping. Renders `XOctagon` glyph leading the badge text whenever variant is `refused`.
- **Approach taken:** new Badge variant uses `border-warning/60 bg-transparent text-[hsl(38_92%_75%)]`; status text stays terse (`refused`) per Open Question #2. The icon ships with the badge via `RunStatusBadge` so every consumer gets the same visual.
- **Design decisions worth flagging:** the refusal banner on the run detail keeps the warning-orange accent (no new color) but uses a 4px left border + transparent fill. Stuck-trigger badges on the triggers list moved to `destructive` variant and explicit `stuck — N failures` copy (the previous `warning` styling shared a color with `awaiting_approval` and the cron-secret banner; promoting to `destructive` removes that ambiguity).
- **What I did NOT do and why:** did not change the AgentRunStatus enum (carved out per Section 8); did not introduce a new color token (per Section 8 + Section 11).

### Item 2 — Shared `IntentEditor` extracted from `IntentBuilder` + `TriggerForm`
- **Brief reference:** Top UX leverage point #2
- **Files modified:**
  - `components/agents/intent-builder.tsx` (522 → 158 lines; now thin wrapper around editor + templates row + plan submit)
  - `components/agents/trigger-form.tsx` (619 → 397 lines; schedule fields + templates row + editor + save submit)
- **Files created:**
  - `components/agents/intent-editor.tsx` — owns registry fetch, live goal validation, scope app/repo chips, invariant tree, risk-tolerance select. Exports `IntentEditor`, `IntentEditorValue`, `RiskTolerance`, `emptyIntentValue()`, `serializeIntentInvariants()`.
- **Approach taken:** the editor takes a fully-controlled `value`/`onChange` pair so each parent owns its own state shape (the IntentBuilder doesn't need scheduling, the TriggerForm does — they hoist different things). Goal-validation lives inside the editor since both surfaces want identical live feedback. Registry fetch deduplicated via `useEffect` on mount; the editor seeds default-on invariants only when the parent's invariants map is empty (so editing an existing trigger does not stomp the saved set).
- **Design decisions worth flagging:**
  - Both parents combined dropped from 1141 → 555 lines (51% reduction; brief required ≥ 30%). The new editor adds 508 lines, but every line of that was duplicated between the two parents before.
  - `useGoalValidator` and `useAgentRegistry` were proposed as separate hooks in the brief; I inlined them into the editor since they aren't needed elsewhere yet. If a third Intent surface lands (the brief mentions webhook-shaped triggers in 5.9), pulling them into hooks is a one-line refactor.
- **What I did NOT do and why:** did not change `/api/agents/registry`, `/api/agents/intent/validate`, or `/api/agents/plan` shapes (per Section 8). The editor consumes the same wire payloads as before.

### Item 3 — Approval-required vs read-only step affordances
- **Brief reference:** Top UX leverage point #3
- **Files modified:**
  - `app/(admin)/admin/agents/[id]/page.tsx` (every step row carries `border-l-4 border-l-warning` for `approval_required` or `border-l-4 border-l-transparent` for `read_only`; an inline `<Badge variant="warning"|"muted">approval-required|read-only</Badge>` ships next to the capability key)
  - `components/agents/intent-editor.tsx` (the same accent + badge pattern is applied inside the capability tree, so operators declaring invariants see at a glance which capabilities need approval)
- **Approach taken:** kept the lock/unlock glyph but moved it inside the badge; the primary signal is now the badge label and the left accent. Both are tied to the same `kind` field so they cannot drift.

### Item 4 — Accessible focus-visible rings on every chip picker
- **Brief reference:** Top UX leverage point #4
- **Files created:**
  - `components/ui/chip.tsx` — single CVA-driven `<Chip>` primitive with variants `default | ghost | tab` and sizes `sm | xs | mono`. Always carries `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`. Selected state uses `aria-pressed="true"` + the existing `border-primary bg-primary/15 text-primary` recipe (contrast verified by brief).
- **Files modified:**
  - `components/agents/intent-editor.tsx` (scope app + repo chips, "show all capabilities" toggle, risk-tolerance select got the focus ring class)
  - `components/agents/intent-builder.tsx` (templates row)
  - `components/agents/trigger-form.tsx` (cron preset chips, templates row)
  - `components/agents/claude-tool-spec.tsx` (curl/python tab toggle, copy button)
- **Approach taken:** Tailwind 3.4 supports `aria-pressed:` natively, so the selected-state styling lives in the CVA without runtime branching. Every `<Chip>` carries a meaningful `aria-label` (or visible text) — no chip relies on a `title` attribute alone.
- **Design decisions worth flagging:** chips that are momentary actions (templates) intentionally do NOT carry `aria-pressed` — they fill in form fields, they are not toggle buttons. Only persistent-selection chips (scope, presets, the "show all caps" toggle) carry `aria-pressed`.

### Item 5 — Trigger-row action density
- **Brief reference:** Top UX leverage point #5
- **Files modified:**
  - `components/agents/trigger-row-actions.tsx` (full rewrite)
  - `app/(admin)/admin/agents/triggers/page.tsx` (passes new `triggerName` prop for aria-labels and the dialog body)
- **Approach taken:**
  - "Fire now" promoted to a labeled `<Button size="sm" variant="outline">` with the `Play` glyph leading.
  - Toggle / Edit / Delete moved into a `DropdownMenu` triggered by a single `MoreHorizontal` icon-button. The destructive item (Delete) is separated by `<DropdownMenuSeparator />` and styled with `text-destructive focus:bg-destructive/10` so it cannot be confused with the navigational items.
  - `window.confirm` replaced with a real `<Dialog>` confirm. The dialog body explains exactly what is and is not destroyed (the schedule, not the audit log of past runs).
  - Every interactive control has an explicit `aria-label`. The dropdown trigger reads "More actions for {triggerName}".

### Item 6 — Empty states with inline primary CTA
- **Brief reference:** Top UX leverage point #6
- **Files created:**
  - `components/agents/empty-state.tsx` — `<AgentEmptyState icon title body action />`. Lucide glyph only — no illustration. Action is a slot for a primary `<Button>`.
- **Files modified:**
  - `app/(admin)/admin/agents/page.tsx` (empty state renders an "Open the planner" outline button anchored to `#intent-builder`; the IntentBuilder card carries the matching `id`)
  - `app/(admin)/admin/agents/triggers/page.tsx` (empty state carries a primary `Plus` "New trigger" Button, inside the empty container, not 200px away in the page header)
  - `app/(admin)/admin/agents/[id]/page.tsx` (planner-couldn't-match branch renders the same empty-state shell)

### Item 7 — CRON_SECRET banner promoted to `Alert`
- **Brief reference:** Top UX leverage point #7
- **Files modified:**
  - `app/(admin)/admin/agents/triggers/page.tsx` — replaced inline div with `<Alert variant="warning">…</Alert>`. The existing primitive already wires `role="alert"`, the absolute icon position, and a stronger title/description hierarchy.
- **Design decisions worth flagging:** combined with the stuck-trigger badge moving to `destructive` (Item 1), the page now has three visually distinct levels of warning — page-level system warning (Alert), per-row failure indicator (destructive Badge), and run-status warning (warning Badge for awaiting_approval, refused outline-Badge for refused).

### Item 8 — M2M-triggered pill consolidation
- **Brief reference:** Top UX leverage point #8
- **Files modified:**
  - `app/(admin)/admin/agents/[id]/page.tsx` — dropped the `M2M-triggered` pill from `PageHeader` actions; the page-header actions slot is now exclusively the run status badge. The first tile in the row below became `<TriggeredByTile>`, which picks one of three modes (human / api-key / cron) from the run shape and shows the source as a small `<Badge variant="outline">` inside the tile.
- **Design decisions worth flagging:** the `cron` mode is detected via `requestedByClerkUserId.startsWith("cron:")` — consistent with how the orchestrator stamps cron-driven runs today. No schema change. If/when a `requestedSource` enum is added at the database level the predicate moves to one place.

### Item 9 — TriggerForm Templates with cron presets
- **Brief reference:** Top UX leverage point #9 (Open Question #4 confirmed: include cron presets)
- **Files created:**
  - `lib/agents/intent-templates.ts` — exports `INTENT_TEMPLATES` and the `IntentTemplate` type. Each entry carries an optional `cron` + `tz`.
- **Files modified:**
  - `components/agents/intent-builder.tsx` (consumes the shared templates list — no behavior change for one-off planner)
  - `components/agents/trigger-form.tsx` (renders the same templates row above the goal field; click-to-apply seeds goal + request + cron + tz; also seeds the trigger name when blank so the form is closer to "ready" after one click)
- **Design decisions worth flagging:** templates render with their suggested cron expression as a small mono tail (`Open risks (read-only) 0 6 * * *`) so the operator sees what schedule each will install before clicking.

### Item 10 — Human-readable error copy
- **Brief reference:** Top UX leverage point #10
- **Files created:**
  - `lib/agents/error-copy.ts` — `humanizeAgentError(slug)` returns `{ headline, slug }`. Falls through to a generic "Something went wrong" for unknown slugs so operators never see a bare slug.
- **Files modified:**
  - `components/agents/intent-builder.tsx`
  - `components/agents/trigger-form.tsx` (also adds a "Still needed: X, Y, Z" line that explains exactly why the submit is disabled — addresses the brief's friction point about disabled-button ambiguity)
  - `components/agents/run-actions.tsx`
  - `components/agents/trigger-row-actions.tsx`
- **Approach taken:** every former `<span className="font-mono text-destructive">{error}</span>` site now renders the English headline with the slug as a small mono tail in 70%-opacity. The slug stays grep-able for tickets and audit; the operator reads English first.

## New primitives introduced

| Component | Location | Purpose | Used by |
|---|---|---|---|
| `Chip` | `components/ui/chip.tsx` | Togglable pill button with focus-visible ring + `aria-pressed` | IntentEditor, IntentBuilder, TriggerForm, ClaudeToolSpec |
| `RunStatusBadge` / `StepStatusBadge` | `components/agents/run-status-badge.tsx` | Single source of truth for AgentRunStatus → Badge variant + glyph | `/admin/agents`, `/admin/agents/[id]`, `/admin/agents/triggers` |
| `AgentEmptyState` | `components/agents/empty-state.tsx` | Lucide-glyph empty placeholder with optional inline CTA slot | All three list pages + run-detail no-steps branch |
| `IntentEditor` | `components/agents/intent-editor.tsx` | Shared Intent declaration UI (registry, scope, invariants, tolerance) | IntentBuilder, TriggerForm |

## Tokens / config changed

- **`components/ui/badge.tsx`** — added a single new variant `refused` (`border-warning/60 bg-transparent text-[hsl(38_92%_75%)]`). No new CSS variable, no new color in `tailwind.config.ts` or `app/globals.css` — composes existing `warning` token.

That is the only design-system change. No new global colors, no new tokens.

## Test commands run and their result

- `npx tsc --noEmit` — **pass** (zero output, exit 0)
- `npx next build` — **pass** (49 routes generate; "Compiled successfully", "Generating static pages (49/49)", exit 0)
- `npm run lint` — **not run** — the project's lint script triggers an interactive ESLint setup prompt (`next lint` has never been configured). The brief notes this in Section 9: "verification path is `npm run build`."

## Known limitations

- **No live screenshots.** The Clerk auth gate blocks unauthenticated rendering; the verifier is expected to do a JSX-level diff review per Section 9 of the brief. Component shapes have been kept intentionally simple so the diff reads cleanly.
- **`requestedSource` is inferred, not enumerated.** The new `TriggeredByTile` infers `cron` mode from a string prefix on `requestedByClerkUserId`. This was the non-invasive option because Section 8 carves out `prisma/schema.prisma`. If a follow-up slice adds a real source enum, the inference moves to one place (`pickTriggerSource()` in `app/(admin)/admin/agents/[id]/page.tsx`).
- **Goal-validator + registry hooks are inlined.** The brief proposed `useAgentRegistry()` + `useGoalValidator()` as separate hooks. They live inside `IntentEditor` for now since they have a single consumer. A 5.9 webhook-trigger slice is the trigger to extract.
- **Templates seed only when the trigger name is blank.** Some operators may be surprised to see a name appear when they click a template after typing-then-clearing the name field. This was the conservative choice — never overwrite a non-empty user-typed name.
- **Brief leverage point #6 mentioned a "show all 16 capabilities" disclosure on the planner-couldn't-match empty state.** I rendered the empty state through `AgentEmptyState` with explanatory copy but did NOT add a capability disclosure list. That would either duplicate the IntentEditor's invariant tree or fetch the registry a second time on a server component; both feel out of scope for a polish pass. Flagging so the verifier knows it was a deliberate trim.

## Suggested verifier focus

1. **`refused` is unambiguously distinct from `awaiting_approval`** on `/admin/agents`, `/admin/agents/triggers`, and `/admin/agents/[id]`. Verify by reading the `RunStatusBadge` JSX and confirming the `refused` variant in `components/ui/badge.tsx` ships with `bg-transparent` (no fill) while `warning` ships with `bg-warning/15` (filled).
2. **Step affordance:** open `app/(admin)/admin/agents/[id]/page.tsx` and confirm every step `<li>` resolves to either `border-l-4 border-l-warning` (approval_required) or `border-l-4 border-l-transparent` (read_only), and renders a labeled `Badge variant="warning"|"muted"` with the words "approval-required" or "read-only".
3. **Chip a11y:** in `components/ui/chip.tsx`, confirm the base CVA includes `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`. Confirm every consumer (IntentEditor scope/repo, IntentBuilder + TriggerForm templates, TriggerForm cron presets, ClaudeToolSpec tabs) has migrated to `<Chip>` and is no longer a hand-rolled `<button className="rounded-full ...">`.
4. **Trigger row dialog:** open the trigger row actions component; confirm `window.confirm` is gone and a `<Dialog>` with `<DialogTitle>Delete this trigger?</DialogTitle>` ships in its place. Confirm Toggle / Edit / Delete are inside `<DropdownMenu>` and that the dropdown trigger has an `aria-label`.
5. **Empty-state CTAs:** confirm `/admin/agents/triggers` empty state renders a primary `<Button>...New trigger</Button>` *inside* the empty container (in `<AgentEmptyState action={...}>`), not just in the page header.
6. **Diff line count for IntentBuilder + TriggerForm.** Brief required ≥ 30% reduction. Combined dropped from 1141 → 555 lines (51%). The duplicated machinery now lives in `intent-editor.tsx` (508 lines, single source of truth).
7. **No new global colors:** grep `app/globals.css` and `tailwind.config.ts` — no diff.
8. **Hard-constraint files untouched:** verify zero diff in `lib/agents/orchestrator.ts`, `lib/agents/planner.ts`, `lib/agents/capabilities/*`, `lib/agents/intent/invariants.ts`, `lib/agents/intent/validator.ts`, `lib/agents/intent/scope.ts`, `prisma/schema.prisma`, and any `app/api/agents/**` route handlers.
