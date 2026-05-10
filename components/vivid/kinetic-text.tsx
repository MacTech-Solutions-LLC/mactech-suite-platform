"use client";

/**
 * Sprint 44 — kinetic typography primitive (Vivid /command-center).
 *
 * Splits a string into spans per character, then staggers their
 * entrance via per-character animation-delay. Used by the hero.
 *
 * Reduced-motion: collapses to a single static span (no per-char
 * animation, no staggered delays).
 */

import { useEffect, useState } from "react";

export interface KineticTextProps {
  text: string;
  /** Base delay before the first character animates in (ms). */
  startDelayMs?: number;
  /** Per-character stagger (ms). */
  stepMs?: number;
  className?: string;
  as?: "span" | "h1" | "h2" | "div";
}

export function KineticText({
  text,
  startDelayMs = 0,
  stepMs = 18,
  className,
  as = "span",
}: KineticTextProps) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const Tag = as as keyof JSX.IntrinsicElements;

  if (reduced) {
    return <Tag className={className}>{text}</Tag>;
  }

  // Word-boundary preservation: split on " " then re-emit a normal
  // space between word groups, so line-wrapping stays sane.
  const words = text.split(" ");
  let charIndex = 0;
  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, wi) => (
        <span
          key={`w-${wi}`}
          className="inline-block whitespace-nowrap"
          aria-hidden
        >
          {Array.from(word).map((ch) => {
            const i = charIndex++;
            const delay = startDelayMs + i * stepMs;
            return (
              <span
                key={`c-${i}`}
                className="inline-block animate-mt-rise"
                style={{ animationDelay: `${delay}ms` }}
              >
                {ch}
              </span>
            );
          })}
          {wi < words.length - 1 ? (
            <span aria-hidden="true">&nbsp;</span>
          ) : null}
        </span>
      ))}
    </Tag>
  );
}
