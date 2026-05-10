/**
 * Sprint 51 — Vivid wrapper for /admin/product-access (entitlement
 * matrix).
 *
 * Same canvas pattern as /command-center and /admin/apps/[appKey]:
 * radial-gradient aurora + grid texture. We deliberately omit the
 * cursor spotlight here — the matrix table is dense, sticky-corner,
 * and benefits from a stable visual baseline. A tracked spotlight
 * over the data area would compete with the toggle buttons for
 * attention.
 *
 * Vivid scope is now: dashboard + per-app triage + entitlement
 * matrix. Other admin routes still use the existing neutral chrome.
 */

export default function ProductAccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-vivid-scope="entitlement-matrix"
      className="relative isolate -mx-4 -my-6 min-h-[calc(100vh-4rem)] overflow-hidden bg-mt-bg font-mt-display text-mt-text md:-mx-6 md:-my-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 50% 35% at 6% 4%, rgba(0, 229, 255, 0.12), transparent 60%)",
            "radial-gradient(ellipse 50% 35% at 94% 8%, rgba(124, 92, 255, 0.12), transparent 60%)",
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
      <div className="relative z-[1] px-4 py-8 md:px-8 md:py-10">{children}</div>
    </div>
  );
}
