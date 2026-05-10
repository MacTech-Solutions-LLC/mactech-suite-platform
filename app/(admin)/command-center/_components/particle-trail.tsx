"use client";

/**
 * Sprint 48 — particle cursor trail (Vivid /command-center).
 *
 * A canvas overlay that emits 1–3 tiny cyan/violet/magenta particles
 * behind the cursor on each frame the cursor moves. Particles fade
 * out + drift slightly upward over ~500ms.
 *
 * Performance posture:
 *   - Single full-window canvas, sized to devicePixelRatio.
 *   - Particle pool capped at 64 (anything older is recycled).
 *   - When the window/tab is hidden, the loop pauses entirely.
 *   - Reduced-motion + coarse pointer → renders nothing.
 *
 * Layered ABOVE the cursor spotlight; this is the punctuation, that
 * is the atmosphere.
 */

import { useEffect, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1, decreases each tick
  hue: number; // index into the palette
}

const PALETTE = ["#00E5FF", "#7C5CFF", "#FF5BD0"];
const MAX_PARTICLES = 64;

export function ParticleTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    let lastX = -1000;
    let lastY = -1000;
    let running = true;
    let raf = 0;

    const emit = (x: number, y: number) => {
      const dx = x - lastX;
      const dy = y - lastY;
      const speed = Math.hypot(dx, dy);
      lastX = x;
      lastY = y;
      const burst = Math.min(3, Math.max(1, Math.round(speed / 14)));
      for (let i = 0; i < burst; i++) {
        const p: Particle = {
          x: x + (Math.random() - 0.5) * 4,
          y: y + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -0.3 - Math.random() * 0.4,
          life: 1,
          hue: Math.floor(Math.random() * PALETTE.length),
        };
        if (particles.length >= MAX_PARTICLES) particles.shift();
        particles.push(p);
      }
    };

    const onMove = (e: MouseEvent) => {
      if (!running) return;
      emit(e.clientX, e.clientY);
    };
    const onVisibility = () => {
      running = !document.hidden;
      if (running && !raf) raf = requestAnimationFrame(loop);
    };

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.life -= 0.025;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vy *= 0.98;
        const r = 1.6 + (1 - p.life) * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        const color = PALETTE[p.hue]!;
        ctx.fillStyle = color;
        ctx.globalAlpha = p.life * 0.85;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      if (running) raf = requestAnimationFrame(loop);
      else raf = 0;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
