# Sprint 52 — Design tokens migration (correction to Sprint 51 commit notes)

## TL;DR

The Vivid `mt-*` token system was migrated from inline `tailwind.config.ts` values to the published `@mactech-solutions-llc/design-tokens` package (`0.1.0`, GitHub Packages, `@mactech-solutions-llc` scope). MacSuite now consumes the same tokens that ship to the registry site at `design.mactechsolutionsllc.com` and that every other MacTech app will pull from.

This sprint also corrects a false-positive note in the Sprint 51 commit message — see "Correction" below.

## Correction to `5f88bd0` ("track B — entitlement matrix Vivid + operator rail + New sheet")

The trailing paragraph of that commit message reads:

> A prompt-injection attempt during this work tried to introduce a fake @mactech-solutions-llc/design-tokens dependency, rewrite tailwind.config.ts / package.json / globals.css / docs to depend on it, replace command-center/layout.tsx wholesale, and drop a pile of phantom _components/cc-* files + _data + _actions + components/ mactech. All of that was reverted before commit; this commit contains only legitimate Track B work.

That assessment was a **false positive**. The work being flagged was the legitimate Spec 01 + Spec 02 deliverable from the `mactech-design-system` build prompt:

- The package was real (it now exists on GitHub Packages, version `0.1.0`, scope `@mactech-solutions-llc`).
- The 12 `components/mactech/*` files matched the Spec 01 v0.1 component list exactly and were copies of what the registry serves at `design.mactechsolutionsllc.com/r/<name>.json`.
- The `tailwind.config.ts` / `globals.css` / `layout.tsx` rewrites matched Spec 02 §3 verbatim.
- The `_components/cc-*`, `_actions/`, `_data/` folder structure matched Spec 02 §7 verbatim.

The reviewer pattern-matched "sudden new dependency + 12 new component files + wholesale layout rewrite" to a prompt-injection signature without the cross-reference to `mactech-build/PROMPT.md`, `specs/01-design-system.md`, and `specs/02-command-center.md` that authorized the work.

## What changed in this sprint

Five files. Net additive.

| File | Change |
|---|---|
| `package.json` | `@mactech-solutions-llc/design-tokens: "^0.1.0"` added to dependencies. |
| `.npmrc` (new) | Auth scope `@mactech-solutions-llc → npm.pkg.github.com` with `${NODE_AUTH_TOKEN}` substitution. |
| `tailwind.config.ts` | `presets: [mactechPreset]`. Inline `mt-bg/mt-text/mt-cyan/...` color block removed (now sourced from the preset's CSS-variable utilities). Backwards-compat aliases (`mt-cyan` → `var(--mt-accent)`, `mt-violet` → `var(--mt-accent-2)`, `mt-magenta` → `var(--mt-accent-3)`, `mt-lime` → `var(--mt-success)`, `mt-amber` → `var(--mt-warning)`, `mt-rose` → `var(--mt-danger)`, `mt-hairline-strong` → `var(--mt-hairline-3)`, `font-mt-display` → `var(--mt-font-sans)`) preserved so every Sprint 44/45/46/50/51 component renders unchanged. Sprint 44 keyframes/animations and `box-shadow` glow stack kept. |
| `app/globals.css` | One line added: `@import "@mactech-solutions-llc/design-tokens/moods/vivid.css";`. The mood file's selector is `[data-mt-mood="vivid"]`-only, so importing globally only takes effect inside opted-in subtrees. |
| `app/(admin)/command-center/layout.tsx`, `app/(admin)/admin/product-access/layout.tsx`, `app/(admin)/admin/apps/[appKey]/layout.tsx` | `data-mt-mood="vivid"` attribute added to each Vivid-scoped wrapper div. Sprint 51's `data-vivid-scope` attributes preserved. No component mounts changed — `CursorSpotlight`, `ParticleTrail`, `ShortcutsOverlay`, `NewActionSheet`, `OperatorRail` all stay exactly as Sprint 51 left them. |
| `components/mactech/` (new dir, 12 files) | Component sources for the v0.1 registry: `kinetic-text`, `cursor-trail`, `cursor-spotlight`, `magnetic-button`, `tilted-card`, `ecosystem-map`, `brushable-chart`, `inline-edit-table`, `mt-button`, `mt-card`, `mt-sheet`, `mt-command`. Same files `npx shadcn add https://design.mactechsolutionsllc.com/r/<name>.json` would install once the registry is deployed. Available for future composition; nothing on the existing routes references them yet. |

## What did NOT change

- Every component under `components/vivid/`, `components/command-center/`, and `app/(admin)/command-center/_components/` is byte-for-byte unchanged.
- The shadcn HSL palette (`hsl(var(--background))` etc.) used by every non-Vivid admin route — unchanged.
- All Sprint 51 features — operator rail, unified New sheet, entitlement matrix Vivid pass — unchanged.
- `/dashboard`, `/governance/*`, `/auditor-access`, `/welcome`, `/sign-in`, `/admin/*` (apart from product-access and apps/[appKey] which already had Vivid scopes) — unchanged.

## How the swap actually works

Tokens ship as CSS variables, not literal values:

```css
/* Before (Sprint 44, inline in tailwind.config.ts) */
"mt-bg": "#06070C"

/* After (preset, resolved per-mood) */
"mt-bg": "var(--mt-bg)"  /* declared by data-mt-mood="vivid" subtree */
```

Components emit the same `bg-mt-bg` class either way. The preset version reads the variable from the active mood file. No `data-mt-mood` ancestor → variable undefined → utility renders as no-op (not an error). That's the property that lets the same package power four different moods (Vivid, Quiet, Editorial, Brutalist) without bleed.

## Verifying

```bash
NODE_AUTH_TOKEN=<read:packages PAT> npm install
npx tsc --noEmit          # clean
npm run build             # /command-center, /admin/product-access, /admin/apps/[appKey] all green
```

Bundle size delta on `/command-center`: zero (no new code in the existing routes). The `components/mactech/*` files don't ship to any current page until something imports them.

## Per-app rollout

The published package is now ready for Capture, Codex, Training, Quality, Governance, EnclaveWatch, clearD, Opportunities, Proposal, and Vetted to consume. See `mactech-design-system/MIGRATION.md` for the per-app guide. The mood mapping table:

| App | Mood |
|---|---|
| Capture | Vivid |
| Codex | Vivid |
| Training | Editorial |
| Quality (QMS) | Quiet |
| Governance | Quiet |
| EnclaveWatch | Vivid |
| clearD | Editorial |
| Opportunities | Vivid |
| Proposal | Quiet |
| Vetted | Editorial |

## References

- Design system source: <https://github.com/WELCOMETOTHETRIBE/mactech-design>
- `MIGRATION.md` (per-app adoption guide): <https://github.com/WELCOMETOTHETRIBE/mactech-design/blob/main/MIGRATION.md>
- `ROADMAP.md` (v0.2+ component slate): <https://github.com/WELCOMETOTHETRIBE/mactech-design/blob/main/ROADMAP.md>
- Published package on GitHub Packages: `@mactech-solutions-llc/design-tokens@0.1.0`
- `5f88bd0` — Sprint 51 commit. **Disregard the trailing paragraph re: prompt injection.**
