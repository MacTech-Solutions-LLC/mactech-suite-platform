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

## 5. Components

### Sprint 44 — foundation

| File | Role |
| --- | --- |
| `_components/cursor-spotlight.tsx` | Fixed-position 600×600 cyan→violet radial that follows the cursor via CSS variable + transform. `mix-blend-mode: screen`. Disabled under `prefers-reduced-motion` and on coarse pointers. |
| `_components/kinetic-text.tsx` | Splits a string into per-character spans and staggers their entrance with `animation-delay`. Reduced-motion collapses to a static span. |
| `_components/cc-hero.tsx` | Replaces `<PageHeader>` for this route. Brand mark + eyebrow + kinetic display title with italic *Instrument Serif* gradient em-phrase + tagline + magnetic CTA pills. Bottom hairline uses a horizontal cyan→violet→magenta gradient. |
| `_components/vivid-card.tsx` | `VividCard` (glass recipe) + `VividSectionHeader` (eyebrow + title + meta). |
| `layout.tsx` | Scoped sub-layout — radial gradient aurora, 32px grid texture, mounts `<CursorSpotlight />` + `<ParticleTrail />` + `<ShortcutsOverlay />`. |

### Sprints 45–49 — full system

| File | Role |
| --- | --- |
| `_components/kinetic-number.tsx` | `requestAnimationFrame` count-up to a target value, eased with `mt-out`. Re-runs when `value` changes. Reduced-motion: jumps. |
| `_components/sparkline.tsx` | Server-renderable mini SVG sparkline — area + line + last-point dot. No JS. |
| `_components/bucket-24h.ts` | Buckets a flat list of timestamped events into 24 hourly slots ending now. Used by both stat-card sparklines and the brushable chart. |
| `_components/vivid-stat-card.tsx` | Glass tile with kinetic number + uppercase eyebrow + sub-line + optional sparkline. Six tonal variants (default/cyan/violet/amber/rose/muted) wrapped inside a `<TiltCard>`. |
| `_components/vivid-stat-grid.tsx` | Server-rendered 8-tile grid: Apps, Up, Degraded, Down, Open Risks, Critical, Deploys 24h, Agent runs 24h. Replaces `OverviewTiles` on this route. |
| `_components/brushable-activity.tsx` | `recharts` stacked area over 24 hourly buckets — deploys (cyan), agent runs (violet), risks opened (rose), failed workflows (amber). Drag the bottom brush to scope the headline totals. |
| `_components/ecosystem-map.tsx` | Server-rendered SVG constellation — every active App on a ring around a "MacTech Suite" core. Inner ring = mission-critical / high; outer = medium / low. Node fill = criticality color, stroke = latest health color, pulse ring on degraded/down. Click any node to jump to its admin page. |
| `_components/tilt-card.tsx` | 3D tilt parallax wrapper. Up to ±8° rotation in each axis tracking cursor, plus a soft cursor-tracked spotlight overlay (`mix-blend-mode: soft-light`). Reduced-motion + coarse pointer: static. |
| `_components/magnetic-button.tsx` | `MagneticButton` + `MagneticLink`. Translate up to ±10px toward the cursor when within a 120px radius, easing out with `mt-spring`. Reduced-motion + coarse pointer: static. |
| `_components/particle-trail.tsx` | Full-window canvas. Emits 1–3 cyan/violet/magenta particles per `mousemove` frame; particles drift up + fade over ~500ms. Pool capped at 64; pauses on tab hide. Reduced-motion + coarse pointer: not rendered. |
| `_components/shortcuts-overlay.tsx` | Lazy-mounted Vivid-skinned dialog. Press `?` to open; `g` then `c/a/s` jumps to /command-center, /admin/agents, /status. Ignores keystrokes inside inputs. |

## 6. Page structure

`app/(admin)/command-center/page.tsx` (top → bottom):

1. **CCHero** — kinetic title + tagline + magnetic public-status / AgentOps pills + last-synced / sync action.
2. **FixUnhealthyBanner** + **AwaitingApprovalStrip** — pre-existing operator strips, now on the Vivid canvas.
3. **VividCard tone="cyan"** — Today digest.
4. **VividCard tone="violet"** — Ask AI copilot.
5. **VividStatGrid** — 8 kinetic-number tiles with sparklines (sprint 45).
6. **VividCard "Activity / Last 24 hours"** — brushable stacked area chart (sprint 46).
7. **VividCard "Map / Ecosystem"** — radial constellation of every app (sprint 47).
8. Two-up grid: apps table + (rose-toned-when-criticals) open risks feed.
9. **VividCard** — About / `/status` link.

## 7. Accessibility

- `prefers-reduced-motion: reduce` short-circuits both the cursor spotlight (renders nothing) and the kinetic per-character animation (collapses to a static span).
- The brand mark is `aria-hidden`; the kinetic text mirrors the full string in `aria-label`.
- The cursor spotlight is `pointer-events: none` and decorative — never interactive.
- All accent colors meet WCAG AA against `mt-bg` for body-text usage. Tag/eyebrow text uses `mt-text-3` (#8C93A4), which clears AA at sizes ≥ 14px on `mt-bg`.

## 8. Status against the Master Build Prompt

The Master Build Prompt described 13 phases. Sprints 44–49 (this PR) shipped:

- ✅ Tokens · Fonts · Route shell · Hero · Stat cards · Activity chart (brushable) · Ecosystem map · 3D tilt · Magnetic CTAs · Particle trail · Shortcuts overlay
- ➖ **Cmd+K palette** — already shipped in sprint 31 globally; intentionally NOT re-skinned to keep Vivid scoped.

Remaining for follow-up (intentionally out of scope here):

1. **Resizable sidebar** — would leak out of `/command-center` (the AdminShell sidebar is global). Owner-decision sprint: ship as an opt-in flag, or split into a Vivid-only secondary sidebar.
2. **Per-app deploy progress strip** — sub-page surface (an app detail view), not the dashboard. Belongs in a `/admin/apps/[appKey]` follow-up.
3. **Entitlement matrix view** — already lives at `/admin/product-access`; promoting it to a Vivid-skinned tile is a future cross-route migration.
4. **"New" sheet** — generic create-new actions (new agent, new trigger, new app). Currently each surface owns its own creation flow; a Vivid sheet would unify them but requires API-shape work first.

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
