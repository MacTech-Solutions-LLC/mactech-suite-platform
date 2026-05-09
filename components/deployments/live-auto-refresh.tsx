"use client";

/**
 * LiveAutoRefresh — Sprint 34.
 *
 * Tiny client component that calls router.refresh() on an interval.
 * Triggers a server-side re-render of the parent route, which means
 * any server-rendered live-data sections (LiveActivityStrip on
 * /admin/ops/deployments) get fresh data without a full reload.
 *
 * Renders a small "live · refreshing every Ns" badge so the operator
 * can see the dashboard is actively updating + click pause if they
 * want to inspect a frame without it changing under them.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RotateCw } from "lucide-react";

interface Props {
  /** Refresh interval in seconds. Default 10. */
  intervalSec?: number;
}

export function LiveAutoRefresh({ intervalSec = 10 }: Props) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      router.refresh();
      setTick((n) => n + 1);
    }, intervalSec * 1000);
    return () => clearInterval(t);
  }, [paused, intervalSec, router]);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
      {paused ? (
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      ) : (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
      )}
      <span>
        {paused ? "paused" : `live · ${intervalSec}s`}
      </span>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        className="text-muted-foreground hover:text-foreground"
        aria-label={paused ? "Resume auto-refresh" : "Pause auto-refresh"}
      >
        {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={() => {
          router.refresh();
          setTick((n) => n + 1);
        }}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Refresh now"
        title={`refreshed ${tick} time${tick === 1 ? "" : "s"}`}
      >
        <RotateCw className="h-3 w-3" />
      </button>
    </div>
  );
}
