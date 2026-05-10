"use client";

import { useEffect, useRef } from "react";

export interface CursorSpotlightProps {
  /** Spotlight diameter in px. Defaults to 600. */
  size?: number;
  /** Lerp factor; lower = laggier follow. */
  ease?: number;
}

export function CursorSpotlight({
  size = 600,
  ease = 0.12,
}: CursorSpotlightProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;

    target.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    current.current = { ...target.current };

    function onMove(e: PointerEvent) {
      target.current = { x: e.clientX, y: e.clientY };
    }

    let raf = 0;
    function loop() {
      const node = ref.current;
      if (!node) return;
      current.current.x += (target.current.x - current.current.x) * ease;
      current.current.y += (target.current.y - current.current.y) * ease;
      node.style.transform = `translate(${current.current.x - size / 2}px, ${current.current.y - size / 2}px)`;
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [ease, size]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[2] rounded-full"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle, var(--mt-soft-accent) 0%, transparent 60%)",
        filter: "blur(40px)",
        mixBlendMode: "screen",
      }}
    />
  );
}
