/**
 * Sprint 50 — Vivid scope wrapper for /admin/apps/[appKey].
 *
 * Mirrors the /command-center layout pattern: radial-gradient aurora,
 * grid texture, cursor spotlight. Particle trail + shortcuts overlay
 * are intentionally omitted — those are dashboard chrome and would
 * be over-the-top on a triage page where the operator is reading
 * dense data, not skimming.
 *
 * Vivid expansion rationale: the Ecosystem Map (sprint 47) deep-
 * links here, so making the click-through visually consistent keeps
 * the operator in the Vivid headspace. Other admin routes still
 * stay on the existing neutral chrome.
 */

import { CursorSpotlight } from "@/app/(admin)/command-center/_components/cursor-spotlight";

export default function AppDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-mt-mood="vivid"
      data-vivid-scope="app-detail"
      className="relative isolate -mx-4 -my-6 min-h-[calc(100vh-4rem)] overflow-hidden bg-mt-bg font-mt-display text-mt-text md:-mx-6 md:-my-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 50% 35% at 8% 6%, rgba(0, 229, 255, 0.14), transparent 60%)",
            "radial-gradient(ellipse 60% 40% at 92% 14%, rgba(124, 92, 255, 0.14), transparent 60%)",
            "radial-gradient(ellipse 50% 35% at 50% 110%, rgba(255, 91, 208, 0.10), transparent 70%)",
            "linear-gradient(180deg, #06070C 0%, #0A0C14 60%, #06070C 100%)",
          ].join(", "),
        }}
      />
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

      <div className="relative z-[1] px-4 py-8 md:px-8 md:py-10">{children}</div>
    </div>
  );
}
