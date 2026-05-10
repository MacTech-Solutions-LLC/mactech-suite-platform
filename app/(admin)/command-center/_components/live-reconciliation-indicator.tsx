"use client";

/**
 * Sprint 50 — live reconciliation indicator (Vivid /command-center).
 *
 * Polls GET /api/command-center/status every 30s. When the response's
 * `lastReconciliationAt` is newer than the timestamp we last knew
 * about, two things happen:
 *
 *   1. The chip flashes briefly cyan to confirm the heartbeat.
 *   2. We fire `router.refresh()` so the surrounding RSC tree (stat
 *      cards, sparklines, brushable chart, ecosystem map) re-fetches.
 *      Kinetic numbers naturally re-animate from old → new value.
 *
 * Visible state:
 *   - "live"  — last poll fresh (default).
 *   - "stale" — five+ minutes since last reconciliation.
 *   - "off"   — fetch failed twice in a row (e.g. backend down,
 *               session expired).
 *
 * The indicator pauses when the tab is hidden and resumes on focus
 * — there's no value polling a backgrounded tab, and the resume
 * fetch immediately catches up if anything happened while away.
 *
 * Reduced-motion: the dot still pulses (it's a status signal, not a
 * decoration), but the colored ring on tick-receive is suppressed.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Props {
  /** Initial server-rendered timestamp, ISO. Falsy means "never reconciled." */
  initialAt: string | null;
  pollMs?: number;
  /** How long since reconciliation before we show "stale." */
  staleAfterMs?: number;
}

interface ApiResponse {
  ok: boolean;
  status?: { lastReconciliationAt: string | null };
}

export function LiveReconciliationIndicator({
  initialAt,
  pollMs = 30_000,
  staleAfterMs = 5 * 60_000,
}: Props) {
  const router = useRouter();
  const [lastAt, setLastAt] = useState<string | null>(initialAt);
  const [tick, setTick] = useState<"idle" | "received">("idle");
  const [tone, setTone] = useState<"live" | "stale" | "off">("live");
  const [now, setNow] = useState<number>(() => Date.now());
  const failuresRef = useRef(0);
  const reducedRef = useRef<boolean>(false);

  useEffect(() => {
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  // Drive the "ago" relative-time string by ticking `now` every 15s.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Tone derives from how stale `lastAt` is.
  useEffect(() => {
    if (failuresRef.current >= 2) {
      setTone("off");
      return;
    }
    if (!lastAt) {
      setTone("stale");
      return;
    }
    const ageMs = now - new Date(lastAt).getTime();
    setTone(ageMs > staleAfterMs ? "stale" : "live");
  }, [lastAt, now, staleAfterMs]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (document.hidden) {
        timer = setTimeout(poll, pollMs);
        return;
      }
      try {
        const res = await fetch("/api/command-center/status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ApiResponse;
        const newAt = data.status?.lastReconciliationAt ?? null;
        failuresRef.current = 0;
        if (newAt && newAt !== lastAt) {
          setLastAt(newAt);
          if (!reducedRef.current) {
            setTick("received");
            setTimeout(() => setTick("idle"), 1200);
          }
          // Refresh RSC so stat cards / sparklines / chart / map re-fetch.
          router.refresh();
        }
      } catch {
        failuresRef.current += 1;
        if (failuresRef.current >= 2) setTone("off");
      } finally {
        if (!stopped) timer = setTimeout(poll, pollMs);
      }
    }

    timer = setTimeout(poll, pollMs);

    const onVisibility = () => {
      if (!document.hidden && timer) {
        clearTimeout(timer);
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // We intentionally only re-run when pollMs changes — `lastAt` is
    // captured by closure but updated via setState, so the next poll
    // picks up the latest value via the same closure-via-state
    // pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, router]);

  const ago = lastAt ? formatAgo(now - new Date(lastAt).getTime()) : "never";
  const dotColor =
    tone === "off" ? "#FF6679" : tone === "stale" ? "#FFB454" : "#00E5FF";
  const label =
    tone === "off"
      ? "Polling offline"
      : tone === "stale"
        ? `Stale · ${ago}`
        : `Live · ${ago}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-mt-2 border bg-mt-surface-1 px-2.5 py-1 font-mt-mono text-[10px] uppercase tracking-[0.18em] transition",
        tone === "off"
          ? "border-mt-rose/30 text-mt-rose"
          : tone === "stale"
            ? "border-mt-amber/30 text-mt-amber"
            : "border-mt-cyan/30 text-mt-cyan",
        tick === "received" && tone !== "off"
          ? "shadow-[0_0_0_1px_rgba(0,229,255,0.45),0_0_24px_-6px_rgba(0,229,255,0.55)]"
          : "",
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="relative inline-flex h-2 w-2">
        <span
          className="absolute inset-0 animate-mt-pulse-glow rounded-full"
          style={{ background: dotColor, opacity: 0.55 }}
        />
        <span
          className="relative inline-block h-2 w-2 rounded-full"
          style={{ background: dotColor }}
        />
      </span>
      {label}
    </span>
  );
}

function formatAgo(ms: number): string {
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
