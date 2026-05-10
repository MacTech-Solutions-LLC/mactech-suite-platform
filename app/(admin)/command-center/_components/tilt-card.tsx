"use client";

/**
 * Sprint 48 — 3D tilt parallax wrapper (Vivid /command-center).
 *
 * Wraps any block of content; on hover, the whole card tilts up to
 * ±8° on the X/Y axes based on cursor position relative to the
 * card's center. Also paints a soft cursor-tracked spotlight on top
 * of its child (mix-blend-mode: soft-light) for that "interactive
 * glass" feel.
 *
 * Inputs: only children + className. We intentionally do NOT take a
 * `style` prop — the wrapper owns transform + perspective.
 *
 * Reduced-motion: degrades to a static div (no listeners attached).
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum tilt in degrees on each axis. Default 8. */
  maxTilt?: number;
  /** Disable the cursor-tracked spotlight overlay. */
  noSpotlight?: boolean;
}

export function TiltCard({
  children,
  className,
  maxTilt = 8,
  noSpotlight = false,
  ...rest
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return;
    setEnabled(true);

    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width; // 0..1
        const py = (e.clientY - rect.top) / rect.height; // 0..1
        const rx = (0.5 - py) * maxTilt * 2;
        const ry = (px - 0.5) * maxTilt * 2;
        el.style.setProperty("--tilt-rx", `${rx.toFixed(2)}deg`);
        el.style.setProperty("--tilt-ry", `${ry.toFixed(2)}deg`);
        el.style.setProperty("--tilt-px", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--tilt-py", `${(py * 100).toFixed(1)}%`);
        raf = 0;
      });
    };
    const onLeave = () => {
      el.style.setProperty("--tilt-rx", `0deg`);
      el.style.setProperty("--tilt-ry", `0deg`);
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [maxTilt]);

  return (
    <div
      ref={ref}
      {...rest}
      className={cn("relative", className)}
      style={{
        ...rest.style,
        perspective: enabled ? "1200px" : undefined,
        // Reset on first paint so reduced-motion users get no offset.
        ["--tilt-rx" as never]: "0deg",
        ["--tilt-ry" as never]: "0deg",
      }}
    >
      <div
        className={cn(
          "relative h-full w-full transition-transform duration-200 ease-mt-out",
          enabled && "will-change-transform",
        )}
        style={
          enabled
            ? {
                transform:
                  "rotateX(var(--tilt-rx)) rotateY(var(--tilt-ry)) translateZ(0)",
                transformStyle: "preserve-3d",
              }
            : undefined
        }
      >
        {children}
        {enabled && !noSpotlight ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(circle at var(--tilt-px) var(--tilt-py), rgba(255,255,255,0.10), transparent 50%)",
              mixBlendMode: "soft-light",
              opacity: 1,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
