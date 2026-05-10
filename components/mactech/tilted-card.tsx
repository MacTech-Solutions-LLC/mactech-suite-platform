"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

export interface TiltedCardProps {
  children: ReactNode;
  /** Max tilt in degrees on each axis. */
  max?: number;
  /** Z-translation on hover. */
  liftPx?: number;
  className?: string;
  style?: CSSProperties;
}

export function TiltedCard({
  children,
  max = 4,
  liftPx = 6,
  className = "",
  style,
}: TiltedCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;

    function onMove(e: PointerEvent) {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * (max * 2);
      const ry = (px - 0.5) * (max * 2);
      node.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(${liftPx}px)`;
      node.style.setProperty("--mt-tilt-x", `${px * 100}%`);
      node.style.setProperty("--mt-tilt-y", `${py * 100}%`);
    }
    function reset() {
      if (!node) return;
      node.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg)";
    }

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", reset);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", reset);
    };
  }, [liftPx, max]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-mt-3 border border-mt-hairline bg-mt-surface-2 transition-transform duration-300 ease-mt-out ${className}`}
      style={{
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(380px circle at var(--mt-tilt-x, 50%) var(--mt-tilt-y, 50%), var(--mt-soft-accent), transparent 60%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
