/**
 * Sprint 44 — Vivid scope wrapper for /command-center.
 *
 * Why a sub-layout: we want the "Stream OS" aesthetic (deep-black,
 * cyan/violet/magenta accents, radial gradients, cursor spotlight,
 * Geist + Instrument Serif) on this surface only — never bleeding
 * into the rest of the admin pages. Nesting under (admin)/layout.tsx
 * means we still inherit the AdminShell sidebar / topbar / auth
 * gates; we just paint over the content area with the vivid canvas.
 *
 * Scoping rules:
 *   - All Vivid tokens are namespaced as `mt-*` in tailwind.config.ts;
 *     other admin routes don't reference them, so swapping this
 *     wrapper out has zero blast radius.
 *   - The gradient + spotlight live ONLY inside this layout's div;
 *     nothing leaks to <html>/<body>.
 *   - Cursor spotlight respects prefers-reduced-motion (in the
 *     component itself).
 */

import { CursorSpotlight } from "./_components/cursor-spotlight";
import { ParticleTrail } from "./_components/particle-trail";
import { ShortcutsOverlay } from "./_components/shortcuts-overlay";
import { NewActionSheet } from "./_components/new-action-sheet";

export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-vivid-scope="command-center"
      className="relative isolate -mx-4 -my-6 min-h-[calc(100vh-4rem)] overflow-hidden bg-mt-bg font-mt-display text-mt-text md:-mx-6 md:-my-8"
    >
      {/* Aurora — three soft radial gradients, layered. The first sits
          top-left (cyan), second top-right (violet), third bottom-
          center (magenta). Pointer-events-none so they never block
          clicks; -z-10 so all real content sits above. The whole
          stack is opacity-tuned to read as "atmosphere," not noise. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 60% 40% at 12% 8%, rgba(0, 229, 255, 0.18), transparent 60%)",
            "radial-gradient(ellipse 50% 35% at 88% 12%, rgba(124, 92, 255, 0.18), transparent 60%)",
            "radial-gradient(ellipse 70% 45% at 50% 110%, rgba(255, 91, 208, 0.14), transparent 70%)",
            "linear-gradient(180deg, #06070C 0%, #0A0C14 60%, #06070C 100%)",
          ].join(", "),
        }}
      />

      {/* Subtle grid texture — 32px squares at 4% opacity. Adds depth
          without competing with the gradients. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <CursorSpotlight />
      <ParticleTrail />
      <ShortcutsOverlay />
      <NewActionSheet />

      <div className="relative z-[1] px-4 py-8 md:px-8 md:py-10">{children}</div>
    </div>
  );
}
