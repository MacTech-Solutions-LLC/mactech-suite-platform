# Command Center UI — Vivid System (Sprint 44)

The `/command-center` route is the flagship operational surface of the MacTech Suite. Sprint 44 rebuilt its visual layer on a new design system — internally codenamed **Vivid** — modeled on the "Stream OS" reference mockup the operator approved.

This document is the contract between the Vivid system and the rest of the Suite. The aesthetic is **scoped to `/command-center`** — other admin routes intentionally stay on the existing neutral chrome.

---

## 1. Mood

> **Vivid:** dark, glass-layered, cyan-accented, with deliberate motion.

Brand tagline: **"One sign-in, every app, full audit trail."** It renders in the hero, with the middle phrase set in italic *Instrument Serif* against a cyan→violet→magenta gradient.

## 2. Scoping rules

| Layer | Rule |
| --- | --- |
| Tailwind tokens | All Vivid tokens are namespaced `mt-*` (e.g. `bg-mt-bg`, `text-mt-cyan`, `rounded-mt-3`). Other admin routes don't use them. |
| Fonts | Registered in `app/layout.tsx` via `next/font/google`. Applied via `font-mt-display` / `font-mt-mono` / `font-mt-serif` classes inside `/command-center` only. |
| Background + spotlight | Live in `app/(admin)/command-center/layout.tsx` — a sub-layout under the existing `(admin)/layout.tsx`. Switching this file out has zero blast radius. |
| Components | All Vivid primitives live in `app/(admin)/command-center/_components/`. Underscored so Next doesn't treat them as routes. |
| `components/ui/*` | **Not modified.** The shadcn primitives stay neutral; Vivid wraps them locally. |

## 3. Tokens

Defined in `tailwind.config.ts` under `theme.extend`. Merged with the existing config — no replacements.

### Colors
- **Surfaces:** `mt-bg` (#06070C), `mt-bg-2` (#0A0C14), `mt-bg-3` (#10131D)
- **Glass tiers:** `mt-surface-1`–`mt-surface-4` (4%–10% white)
- **Hairlines:** `mt-hairline` (8% white), `mt-hairline-strong` (14%)
- **Text:** `mt-text` (#F4F6FB), `mt-text-2`, `mt-text-3`, `mt-text-4`
- **Accents:** `mt-cyan` (#00E5FF), `mt-violet` (#7C5CFF), `mt-magenta` (#FF5BD0)
- **State:** `mt-lime`, `mt-amber`, `mt-rose`

### Geometry
- **Radii:** `rounded-mt-1` (8) → `rounded-mt-5` (28)
- **Glass blur:** `backdrop-blur-mt-glass` (24px) — pair with `saturate(150%)` (set inline in `VividCard`)
- **Easings:** `ease-mt-out` (cubic-bezier(0.16, 1, 0.3, 1)), `ease-mt-spring` (overshoot)

### Shadows
- `shadow-mt-cyan` / `shadow-mt-violet` / `shadow-mt-magenta` — accent halos for focused tiles / CTAs
- `shadow-mt-glass` — neutral inner-top seam + soft drop shadow

### Animations
- `animate-mt-rise` — used by `KineticText` for per-character entrance
- `animate-mt-spin-slow` — 8s linear spin (brand mark)
- `animate-mt-pulse-glow`, `animate-mt-shimmer` — reserved for indicators

## 4. Glass recipe

```tsx
<div
  className="rounded-mt-3 border border-mt-hairline bg-mt-surface-1 shadow-mt-glass"
  style={{
    backdropFilter: "blur(24px) saturate(150%)",
    WebkitBackdropFilter: "blur(24px) saturate(150%)",
  }}
/>
```

This is `<VividCard tone="default">`. Tonal variants (`cyan`, `violet`, `magenta`, `amber`, `rose`) add a colored hairline + a faint inner radial gradient anchored to a corner.

## 5. Components shipped (Sprint 44)

| File | Role |
| --- | --- |
| `_components/cursor-spotlight.tsx` | Fixed-position 600×600 cyan→violet radial that follows the cursor via CSS variable + transform. `mix-blend-mode: screen`. Disabled under `prefers-reduced-motion` and on coarse pointers. |
| `_components/kinetic-text.tsx` | Splits a string into per-character spans and staggers their entrance with `animation-delay`. Reduced-motion collapses to a static span. |
| `_components/cc-hero.tsx` | Replaces `<PageHeader>` for this route. Brand mark + eyebrow + kinetic display title with an italic *Instrument Serif* gradient em-phrase + tagline. Bottom hairline uses a horizontal cyan→violet→magenta gradient. |
| `_components/vivid-card.tsx` | `VividCard` (glass recipe) + `VividSectionHeader` (eyebrow + title + meta). |
| `layout.tsx` | Scoped sub-layout — radial gradient aurora, 32px grid texture, mounts `<CursorSpotlight />`. |

## 6. Page structure

`app/(admin)/command-center/page.tsx`:

1. **CCHero** — kinetic title + tagline + last-synced/sync action.
2. **FixUnhealthyBanner** + **AwaitingApprovalStrip** — pre-existing operator strips, now sitting on the Vivid canvas.
3. **VividCard tone="cyan"** — Today digest.
4. **VividCard tone="violet"** — Ask AI.
5. **VividCard** — Overview tiles.
6. Two-up grid: **VividCard** (apps) + **VividCard tone="rose"** (open risks, when criticals > 0).
7. **VividCard** — About / `/status` link.

## 7. Accessibility

- `prefers-reduced-motion: reduce` short-circuits both the cursor spotlight (renders nothing) and the kinetic per-character animation (collapses to a static span).
- The brand mark is `aria-hidden`; the kinetic text mirrors the full string in `aria-label`.
- The cursor spotlight is `pointer-events: none` and decorative — never interactive.
- All accent colors meet WCAG AA against `mt-bg` for body-text usage. Tag/eyebrow text uses `mt-text-3` (#8C93A4), which clears AA at sizes ≥ 14px on `mt-bg`.

## 8. Deferred to follow-up sprints

The Master Build Prompt described 13 phases; Sprint 44 shipped the foundation. The remaining bespoke pieces are sequenced to land independently:

1. **Ecosystem Map** — SVG centerpiece showing the App Registry as a connected graph (services ↔ deployments ↔ repos).
2. **Brushable activity chart** — `recharts` area chart with click-to-zoom range selection over the last 24h.
3. **Stat-card rewrite** — replaces `OverviewTiles` with kinetic-number + sparkline tiles.
4. **3D tilt parallax** — `framer-motion`-driven hover tilt on the new stat cards. Reduced-motion safe.
5. **Particle cursor trail** — supplementary to the spotlight (Kokonut UI ParticleButton-style).
6. **Resizable sidebar** — shadcn-style splitter applied to the AdminShell (this *would* leak out of `/command-center` — ship as an opt-in flag).
7. **`Cmd+K` palette upgrade** — fold sprint-31 cmdk into the Vivid look.
8. **Shortcuts overlay** — `?` to open a Vivid-styled cheatsheet.

None of the deferred phases are required for the route to function — they layer on top of the foundation in this sprint.

## 9. Adding a new Vivid surface

If a future sprint promotes another admin surface to the Vivid system:

1. Move it under a route group that has its own `layout.tsx` mirroring `app/(admin)/command-center/layout.tsx`.
2. Reuse `VividCard`, `CCHero`, `KineticText` — don't fork them.
3. Stay inside the `mt-*` token namespace.
4. **Don't** restyle `components/ui/*`; wrap locally.

## 10. References

- Design source: `/Users/patrick/Downloads/stream-os.html` (operator-supplied mockup).
- Tailwind config: [`tailwind.config.ts`](../tailwind.config.ts).
- Fonts: [`app/layout.tsx`](../app/layout.tsx) — `Geist`, `Geist_Mono`, `Instrument_Serif` via `next/font/google`.
