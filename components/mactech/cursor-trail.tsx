"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

export interface CursorTrailProps {
  /** Max particles alive at once. */
  max?: number;
  /** Spawn rate, particles per pointermove event. */
  density?: number;
  /** CSS color string for the particles. Reads tokens by default. */
  color?: string;
}

export function CursorTrail({
  max = 80,
  density = 2,
  color,
}: CursorTrailProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const particles = useRef<Particle[]>([]);
  const running = useRef(true);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;

    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();

    function spawn(e: PointerEvent) {
      for (let i = 0; i < density; i++) {
        particles.current.push({
          x: e.clientX,
          y: e.clientY,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2 - 0.4,
          life: 0,
          maxLife: 600 + Math.random() * 300,
          size: 1.5 + Math.random() * 2,
          hue: 184 + Math.random() * 80,
        });
      }
      if (particles.current.length > max) {
        particles.current.splice(0, particles.current.length - max);
      }
    }

    let last = performance.now();
    function frame(now: number) {
      if (!running.current) return;
      const dt = now - last;
      last = now;
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "screen";
      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          particles.current.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.005;
        const t = p.life / p.maxLife;
        const alpha = (1 - t) * 0.55;
        ctx.beginPath();
        ctx.fillStyle =
          color ?? `hsla(${p.hue}, 100%, 65%, ${alpha.toFixed(3)})`;
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    window.addEventListener("pointermove", spawn);
    window.addEventListener("resize", resize);
    return () => {
      running.current = false;
      window.removeEventListener("pointermove", spawn);
      window.removeEventListener("resize", resize);
    };
  }, [color, density, max]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1]"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
