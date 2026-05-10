"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

export interface MagneticButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Distance in px within which the button is "magnetized". */
  radius?: number;
  /** How strongly the button pulls toward the cursor (0–1). */
  strength?: number;
  children: ReactNode;
}

export const MagneticButton = forwardRef<
  HTMLButtonElement,
  MagneticButtonProps
>(function MagneticButton(
  { radius = 80, strength = 0.4, children, className = "", ...rest },
  forwardedRef,
) {
  const internalRef = useRef<HTMLButtonElement | null>(null);
  const ref = (forwardedRef as React.RefObject<HTMLButtonElement>) ?? internalRef;

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const node = ref.current;
    if (!node || reduced) return;

    function onMove(e: PointerEvent) {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) {
        node.style.transform = "translate(0, 0)";
        return;
      }
      const factor = (1 - dist / radius) * strength;
      node.style.transform = `translate(${dx * factor}px, ${dy * factor}px)`;
    }
    function onLeave() {
      if (!node) return;
      node.style.transform = "translate(0, 0)";
    }

    window.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [radius, strength, ref]);

  return (
    <button
      ref={ref}
      className={`relative inline-flex items-center gap-2 rounded-mt-2 bg-mt-accent px-4 py-2 font-mt-mono text-xs uppercase tracking-wider text-mt-on-accent shadow-mt-glow transition-[transform,box-shadow] duration-300 ease-mt-spring will-change-transform hover:shadow-[0_0_36px_var(--mt-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mt-accent focus-visible:ring-offset-2 focus-visible:ring-offset-mt-bg ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
