/**
 * Sprint 44 — Vivid scope wrapper for /command-center.
 *
 * Posture rebase (sprint 55, 2026-05): Vivid stays in place but the
 * decorative motion is pruned. This is a regulated-internal-ops
 * console, not a consumer surface — the operator's chrome holds still.
 *
 * Scoping rules:
 *   - All Vivid tokens are namespaced as `mt-*` in tailwind.config.ts;
 *     other admin routes don't reference them, so swapping this
 *     wrapper out has zero blast radius.
 *   - Background is a single quiet linear gradient (no three-radial
 *     aurora, no grid texture). Atmospheric, not noisy.
 *   - No CursorSpotlight. No ParticleTrail. The shortcuts overlay and
 *     unified New sheet survive because they're functional (keystrokes
 *     `?` and `n`), not decorative.
 */

import { ShortcutsOverlay } from "./_components/shortcuts-overlay";
import { NewActionSheet } from "./_components/new-action-sheet";

export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-mt-mood="vivid"
      data-vivid-scope="command-center"
      className="relative isolate -mx-4 -my-6 min-h-[calc(100vh-4rem)] overflow-hidden bg-mt-bg font-mt-display text-mt-text md:-mx-6 md:-my-8"
    >
      {/* Quiet vertical gradient — one background-image, no animation,
          no radial composition. Reads as "deep ops console," not
          "consumer marketing page." */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #06070C 0%, #0A0C14 60%, #06070C 100%)",
        }}
      />

      <ShortcutsOverlay />
      <NewActionSheet />

      <div className="relative z-[1] px-4 py-8 md:px-8 md:py-10">{children}</div>
    </div>
  );
}
