import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";
import type { HealthCheckSnapshot, HealthStatus } from "@prisma/client";

interface AppHistory {
  appKey: string;
  name: string;
  criticality: string;
  healthUrl: string | null;
  snapshots: HealthCheckSnapshot[];
}

const CELL_TONE: Record<HealthStatus, string> = {
  up: "bg-success/40",
  degraded: "bg-warning/50",
  down: "bg-destructive/60",
  unknown: "bg-muted",
};

/**
 * Per-app health time series — one row per app, one square per probe,
 * newest on the right. A glance gives you the recent shape of the
 * ecosystem; click an app to drill into its full history (future).
 */
export function HealthHistoryGrid({ rows }: { rows: AppHistory[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No health snapshots yet. Click "Sync now" on /command-center to run the first probe pass.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card/40">
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const latest = r.snapshots[0];
          const latestStatus = (latest?.status ?? "unknown") as HealthStatus;
          // Reverse so the squares read left-to-right as oldest → newest.
          const ordered = [...r.snapshots].reverse();
          const latency = latest?.latencyMs;
          return (
            <li
              key={r.appKey}
              className="grid items-center gap-3 px-3 py-2 sm:grid-cols-[200px_auto_1fr_120px]"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {r.appKey} · {r.criticality.replace(/_/g, " ")}
                </div>
              </div>
              <StatusPill status={latestStatus} />
              <div className="flex flex-wrap gap-[3px]">
                {Array.from({ length: 24 }).map((_, i) => {
                  const snap = ordered[ordered.length - 24 + i] ?? null;
                  const tone = snap ? CELL_TONE[snap.status as HealthStatus] : "bg-border/40";
                  return (
                    <span
                      key={i}
                      title={
                        snap
                          ? `${snap.status} · ${snap.statusCode ?? "?"} · ${snap.latencyMs ?? "?"}ms · ${new Date(snap.checkedAt).toLocaleString()}`
                          : "no probe"
                      }
                      className={cn("h-4 w-2 rounded-sm", tone)}
                    />
                  );
                })}
              </div>
              <div className="text-right font-mono text-xs text-muted-foreground">
                {latency !== null && latency !== undefined ? `${latency} ms` : "—"}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
