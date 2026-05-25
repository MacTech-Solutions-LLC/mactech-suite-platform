"use client";

/**
 * Sprint 45 — kinetic number for Vivid stat cards.
 *
 * Counts up from 0 (or from `from`) to `value` over `durationMs`,
 * easing with mt-out. Re-runs only when `value` *changes* — so live
 * polling (which fires router.refresh every 30s) doesn't make every
 * tile twitch when nothing changed.
 *
 * Sprint 55: short-circuit added. Previously every render with the
 * same value still kicked off an rAF tween (visible as a count-up
 * from current → same value due to React render timing on RSC tree
 * refresh). We now bail out early when the next value equals the
 * previously-targeted value, preserving the operator's eye for the
 * tiles whose value actually changed.
 *
 * Reduced-motion: jumps straight to the final value.
 */

import { useEffect, useRef, useState } from "react";

export interface KineticNumberProps {
  value: number;
  /** Optional start value — defaults to 0 on mount, current value on update. */
  from?: number;
  durationMs?: number;
  /** Number formatter; defaults to integer with thousand-separators. */
  format?: (n: number) => string;
  className?: string;
}

const DEFAULT_FMT = (n: number) =>
  Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

// Same easing as the .ease-mt-out token, applied here in JS.
function easeMtOut(t: number) {
  // cubic-bezier(0.16, 1, 0.3, 1) ≈ ease-out-quint approximation
  return 1 - Math.pow(1 - t, 5);
}

export function KineticNumber({
  value,
  from,
  durationMs = 900,
  format = DEFAULT_FMT,
  className,
}: KineticNumberProps) {
  const [display, setDisplay] = useState<number>(from ?? value);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef<number>(from ?? 0);
  const reducedRef = useRef<boolean>(false);
  // Track the last value we *targeted* for an animation. When the
  // parent re-renders with the same number (e.g. polling RSC refresh
  // with no underlying delta), we bail.
  const lastTargetRef = useRef<number | null>(null);

  useEffect(() => {
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  useEffect(() => {
    if (reducedRef.current) {
      setDisplay(value);
      lastTargetRef.current = value;
      return;
    }
    // Short-circuit: nothing changed since last tween, do nothing.
    if (lastTargetRef.current === value) {
      return;
    }
    lastTargetRef.current = value;
    fromRef.current = display;
    startRef.current = null;
    let raf = 0;
    const tick = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = easeMtOut(t);
      setDisplay(fromRef.current + (value - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(display)}
    </span>
  );
}
