"use client";

/**
 * Sprint 48 — magnetic button (Vivid /command-center).
 *
 * A button (or link) that subtly slides toward the cursor when the
 * cursor is within a magnetic radius. Used for the hero's primary
 * CTA(s). Strength tapers with distance.
 *
 * Reduced-motion: degrades to a normal button/link (no transform).
 */

import { forwardRef, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface CommonProps {
  children: React.ReactNode;
  className?: string;
  /** Detection radius in px around the element center. Default 120. */
  radius?: number;
  /** Maximum displacement in px. Default 10. */
  strength?: number;
}

export type MagneticButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

export type MagneticLinkProps = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className"> & {
    href: string;
  };

function useMagneticEffect(
  ref: React.RefObject<HTMLElement>,
  radius: number,
  strength: number,
) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) {
          el.style.transform = "translate3d(0,0,0)";
        } else {
          const pull = (1 - dist / radius) * strength;
          const ux = dx / (dist || 1);
          const uy = dy / (dist || 1);
          el.style.transform = `translate3d(${(ux * pull).toFixed(2)}px, ${(uy * pull).toFixed(2)}px, 0)`;
        }
        raf = 0;
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = "";
    };
  }, [ref, radius, strength]);
}

const BASE_CLS = "transition-transform duration-200 ease-mt-spring will-change-transform";

export const MagneticButton = forwardRef<HTMLButtonElement, MagneticButtonProps>(
  function MagneticButton(
    { children, className, radius = 120, strength = 10, ...rest },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLButtonElement | null>(null);
    useMagneticEffect(innerRef, radius, strength);
    const setRefs = (node: HTMLButtonElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };
    return (
      <button ref={setRefs} className={cn(BASE_CLS, className)} {...rest}>
        {children}
      </button>
    );
  },
);

export const MagneticLink = forwardRef<HTMLAnchorElement, MagneticLinkProps>(
  function MagneticLink(
    { children, className, radius = 120, strength = 10, href, ...rest },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLAnchorElement | null>(null);
    useMagneticEffect(innerRef, radius, strength);
    const setRefs = (node: HTMLAnchorElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };
    return (
      <a ref={setRefs} href={href} className={cn(BASE_CLS, className)} {...rest}>
        {children}
      </a>
    );
  },
);
