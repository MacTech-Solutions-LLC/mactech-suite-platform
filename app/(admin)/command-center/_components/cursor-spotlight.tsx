"use client";

/**
 * Sprint 44 — cursor spotlight (Vivid /command-center).
 *
 * A 600×600 radial-gradient div locked to the viewport, translated to
 * the cursor on every mousemove via a CSS variable + transform. Uses
 * mix-blend-mode: screen so it brightens whatever it passes over
 * without recoloring it.
 *
 * Why CSS vars + transform (not state): re-rendering React on every
 * mousemove burns frames. Mutating two CSS custom properties on the
 * div directly is essentially free.
 *
 * Reduced-motion: when prefers-reduced-motion is on, we render
 * nothing — the spotlight is decorative.
 */

import { useEffect, useRef, useState } from "react";

export function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    if (mql.matches || coarse.matches) return;
    setEnabled(true);

    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let pendingX = 0;
    let pendingY = 0;
    const onMove = (e: MouseEvent) => {
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate3d(${pendingX - 300}px, ${pendingY - 300}px, 0)`;
        raf = 0;
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!enabled) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 -z-10 h-[600px] w-[600px] rounded-full will-change-transform"
      style={{
        background:
          "radial-gradient(circle at center, rgba(0, 229, 255, 0.20), rgba(124, 92, 255, 0.10) 40%, transparent 70%)",
        mixBlendMode: "screen",
        filter: "blur(40px)",
      }}
    />
  );
}
