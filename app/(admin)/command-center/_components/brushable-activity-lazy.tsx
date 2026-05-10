"use client";

/**
 * Sprint 50 — lazy-loaded wrapper around <BrushableActivity>.
 *
 * recharts is ~100kB gzipped. The dashboard wants the chart visible
 * but doesn't need it on the critical path; this wrapper defers the
 * import so first-paint of /command-center stays light. While the
 * chunk loads, we render a Vivid-styled skeleton that matches the
 * eventual chart's footprint so layout doesn't jump.
 *
 * Why client + dynamic instead of `next/dynamic` in the server page:
 * the server page is RSC and can't pass the `ssr: false` option to
 * `next/dynamic`. Wrapping in a small "use client" component lets us
 * use `next/dynamic` cleanly.
 */

import dynamic from "next/dynamic";
import type { BrushableRow } from "./brushable-activity";

const BrushableActivity = dynamic(
  () => import("./brushable-activity").then((m) => m.BrushableActivity),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

export function BrushableActivityLazy({ rows }: { rows: BrushableRow[] }) {
  return <BrushableActivity rows={rows} />;
}

function ChartSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-mt-surface-3" />
            <span className="h-3 w-16 rounded bg-mt-surface-2" />
            <span className="h-5 w-8 rounded bg-mt-surface-3" />
          </div>
        ))}
      </div>
      <div
        className="h-56 w-full overflow-hidden rounded-mt-2 border border-mt-hairline bg-mt-surface-1"
        aria-busy="true"
        aria-label="Loading 24h activity chart"
      >
        <div className="relative h-full w-full">
          <div
            className="absolute inset-0 animate-mt-shimmer"
            style={{
              backgroundImage:
                "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.06) 50%, transparent 65%)",
              backgroundSize: "200% 100%",
            }}
          />
          {/* Faint shape echoing the chart footprint. */}
          <svg
            viewBox="0 0 200 60"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full opacity-40"
          >
            <path
              d="M0,40 C20,30 40,45 60,32 S100,22 120,28 S160,40 200,30 L200,60 L0,60 Z"
              fill="rgba(0,229,255,0.08)"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
