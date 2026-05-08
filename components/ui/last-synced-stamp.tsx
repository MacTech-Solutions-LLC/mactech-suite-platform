import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tiny "last synced N min ago" stamp used in operational tables and
 * the Command Center header. Pure server component — no live tick (the
 * page either re-renders on Sync or polls on a coarse cadence).
 */
export function LastSyncedStamp({
  at,
  className,
  prefix = "Last sync",
}: {
  at: Date | null | undefined;
  className?: string;
  prefix?: string;
}) {
  if (!at) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Clock className="h-3 w-3" />
        {prefix}: never
      </span>
    );
  }
  const ms = Date.now() - new Date(at).getTime();
  const label = formatRelative(ms);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Clock className="h-3 w-3" />
      {prefix}: {label}
    </span>
  );
}

function formatRelative(ms: number): string {
  if (ms < 60_000) return "just now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
