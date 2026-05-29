# Architect Plan
For brief: 2026-05-08T16:54:23-07:00
Iteration: 1

## Items I will address this pass

The brief ranks 1–6 as primary scope; 7–10 as sweeteners if effort permits. I'm taking all ten because items 7–10 are individually small (S effort) and the file overlap is dense — touching the trigger row actions, banners, error copy, and templates is largely the same set of files I'm already opening for items 1–6.

1. **Distinct `refused` visual treatment** (brief #1) — add a `refused` Badge variant (border-only, `XOctagon` glyph, terse `refused` label) and route every status-mapping site to it.
2. **Shared `IntentEditor` primitive** (brief #2) — extract `components/agents/intent-editor.tsx` consuming the registry, scope chips, invariant tree, goal validator, risk tolerance. `IntentBuilder` and `TriggerForm` both wrap it.
3. **Approval-required step affordance** (brief #3) — left-border accent + labeled badge on each step row, both in the IntentEditor capability tree and on the run detail step list.
4. **`focus-visible` rings on chip pickers** (brief #4) — introduce `components/ui/chip.tsx` with a single `chipVariants` cva, `aria-pressed`, ring offset matching `Button`. Use it everywhere a chip is rolled by hand today (apps, repos, templates, presets, ClaudeToolSpec tab toggle, "show all capabilities" toggle).
5. **Trigger row actions** (brief #5) — promote "Fire now" to a labeled `<Button size="sm" variant="outline">`. Move Toggle / Edit / Delete into a `DropdownMenu`. Replace `window.confirm` with a `Dialog` confirmation. `aria-label` everywhere.
6. **Empty-state component + inline CTAs** (brief #6) — extract `components/agents/empty-state.tsx` (lucide-only, no illustration) and use it on `/admin/agents`, `/admin/agents/triggers`, and the run-detail "no plan steps" branch.
7. **CRON_SECRET banner → `Alert` primitive** (brief #7).
8. **M2M-triggered pill consolidation** (brief #8) — drop the PageHeader pill, expand the existing first Tile into a dedicated "Triggered by" tile that handles clerk / api-key / cron sources via a small `Badge variant="outline"`.
9. **TriggerForm Templates with cron presets** (brief #9) — hoist `INTENT_TEMPLATES` to `lib/agents/intent-templates.ts`, add an optional `cron`/`tz` field, render a Templates row inside `TriggerForm` that fills both the Intent and the cron fields.
10. **Human-readable error copy** (brief #10) — add `lib/agents/error-copy.ts` mapping known slugs to operator-readable messages; update `submitError` / `cronError` / row action errors to render English first with the slug as small mono trail.

## For each item:

### Item 1 — Refused badge variant
- Files I will touch:
  - `components/ui/badge.tsx` (add `refused` variant)
  - `components/agents/run-status-badge.tsx` (NEW — shared run-status mapping component)
  - `app/(admin)/admin/agents/page.tsx` (replace local `StatusBadge`)
  - `app/(admin)/admin/agents/[id]/page.tsx` (replace local `StatusBadge`)
  - `app/(admin)/admin/agents/triggers/page.tsx` (replace local `RunStatusBadge`)
- Approach: new `refused` Badge variant uses `border-warning/60 bg-transparent text-[hsl(38_92%_75%)]` (no fill, distinct from filled `warning` variant). Render leading `XOctagon` glyph inside a shared `RunStatusBadge` so the icon ships with the badge wherever it's used.
- New primitives: `<RunStatusBadge status={...} prefix?="last run: " />`
- Risk of regression: low — three call sites, all dispatch on the same enum.

### Item 2 — IntentEditor primitive
- Files I will touch:
  - `components/agents/intent-editor.tsx` (NEW — exports `<IntentEditor value onChange showAllCapabilitiesToggle />`)
  - `components/agents/intent-builder.tsx` (slim down to Templates + Goal + free-text + IntentEditor + submit)
  - `components/agents/trigger-form.tsx` (slim down to Schedule + IntentEditor + Templates + submit)
- Approach: IntentEditor owns the registry fetch (memoized), scope chips, invariant tree (with optional "show all capabilities" toggle when prop set), risk tolerance select. Shape:
  ```ts
  type IntentValue = {
    goal: string; request: string;
    scopeAppIds: Set<string>; scopeRepoIds: Set<string>;
    invariants: Record<string, Set<string>>;
    riskTolerance: "strict"|"moderate"|"permissive";
  };
  ```
  Both parent components hoist their state into one `IntentValue`. Goal-validation hook stays inside IntentEditor since both surfaces want live goal feedback.
- New primitives: `IntentEditor`, `useAgentRegistry()` hook, `useGoalValidator(goal)` hook.
- Risk of regression: medium — refactor of two top-trafficked agent forms. Mitigated by keeping all behavior identical (same fetch endpoints, same payload shapes; only the render tree is unified).

### Item 3 — Step affordance
- Files I will touch:
  - `app/(admin)/admin/agents/[id]/page.tsx` (step row)
  - `components/agents/intent-editor.tsx` (capability tree; this is where IntentBuilder + TriggerForm previously lived)
- Approach: helper `<StepKindBadge kind="approval_required"|"read_only" />`. Step row gets a left border accent class derived from kind: `border-l-4 border-l-warning` for approval-required, `border-l-4 border-l-transparent` (or `border-l-border`) for read-only. Same accent applied to capability rows in IntentEditor.
- New primitives: `<StepKindBadge>` (small co-located helper, not a separate file).
- Risk of regression: low.

### Item 4 — Chip primitive
- Files I will touch:
  - `components/ui/chip.tsx` (NEW)
  - All chip call sites flagged in brief: IntentEditor scope/repo/preset/template/all-caps toggle, `claude-tool-spec.tsx` tab buttons.
- Approach: `cva` with variants `default | scope | preset | template | tab`, sizes `sm | xs`. Selected state via `data-state="on"` and `aria-pressed`. Always carries `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`. Selected chip text colors stay on existing `text-primary` over `bg-primary/15` (verified in brief — meets 4.5:1).
- New primitives: `<Chip>` (single component).
- Risk of regression: low.

### Item 5 — Trigger row actions
- Files I will touch:
  - `components/agents/trigger-row-actions.tsx`
  - `components/agents/delete-trigger-dialog.tsx` (NEW — extracted Dialog confirm)
- Approach:
  - Fire becomes `<Button size="sm" variant="outline">` with `Play` glyph + label "Fire now".
  - Other three actions move into `DropdownMenu` triggered by `<Button size="sm" variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal /></Button>`.
  - Delete inside the menu opens a Dialog asking "Delete this trigger?" with a destructive confirm button. Replaces `window.confirm`.
  - Every icon control gets explicit `aria-label`.
- Risk of regression: low — same API endpoints, only UI grouping changes.

### Item 6 — Empty-state component
- Files I will touch:
  - `components/agents/empty-state.tsx` (NEW — small primitive, lucide glyph only, no illustration)
  - `app/(admin)/admin/agents/page.tsx`
  - `app/(admin)/admin/agents/triggers/page.tsx`
  - `app/(admin)/admin/agents/[id]/page.tsx`
- Approach: `<AgentEmptyState icon title body action? />`. On `/admin/agents/triggers` empty, action = primary `<Button asChild><Link>...New trigger</Link></Button>`. On `/admin/agents` empty, action = anchor `<a href="#intent-builder">` (the IntentBuilder card gets `id="intent-builder"`). On run-detail "no plan steps" branch, leave it textual but use the same empty-state shell for consistency.
- Risk of regression: very low.

### Item 7 — CRON_SECRET banner → Alert
- Files I will touch:
  - `app/(admin)/admin/agents/triggers/page.tsx`
- Approach: replace inline div with `<Alert variant="warning">…</Alert>` from `components/ui/alert.tsx`. Existing primitive already wires `role="alert"` and styled icon.
- Risk of regression: very low.

### Item 8 — M2M pill consolidation
- Files I will touch:
  - `app/(admin)/admin/agents/[id]/page.tsx`
- Approach: drop the PageHeader pill entirely. Expand first Tile into `<TriggeredByTile run={run} />` (inline helper) that picks one of three sub-modes: cron (when `requestedByClerkUserId.startsWith("cron:")`), api-key (when `triggeredByApiKeyId` set), or human (otherwise). Inside the tile a small `Badge variant="outline"` shows the source label.
- Risk of regression: low. Note: `startsWith("cron:")` predicate is read-only; we are not introducing a new column.

### Item 9 — TriggerForm Templates
- Files I will touch:
  - `lib/agents/intent-templates.ts` (NEW — moved from inline)
  - `components/agents/intent-builder.tsx` (consume from new module)
  - `components/agents/trigger-form.tsx` (consume + render Templates row that also fills cron when present)
- Approach: shared array; each entry optionally carries `cron?: string; tz?: string`. Default cron presets per template:
  - Open risks → `0 6 * * *` UTC
  - Deployment drift → `0 6 * * 1` UTC
  - Failing workflow runs → `0 */6 * * *` UTC
  - Health failures → `*/15 * * * *` UTC
  - Recent release notes → `0 6 * * *` UTC
- Risk of regression: low.

### Item 10 — Error copy
- Files I will touch:
  - `lib/agents/error-copy.ts` (NEW)
  - `components/agents/intent-editor.tsx` (used via IntentBuilder + TriggerForm)
  - `components/agents/intent-builder.tsx`
  - `components/agents/trigger-form.tsx`
  - `components/agents/run-actions.tsx`
  - `components/agents/trigger-row-actions.tsx`
- Approach: small lookup `humanizeAgentError(slug: string): { headline, slug }` returning English first. Render with monospace tail. Unknown slug falls through to "Something went wrong" + slug.
- Risk of regression: very low — pure copy improvement, slug still visible.

## Items I am deferring this pass

None. The brief explicitly carved out architecture/runtime files in Section 8; I am respecting that. All ten leverage points are addressed.

The brief's noted research gap (no Feedback table, no in-product feedback channel) is **out of scope per Open Question #3 — human responded "defer."**
