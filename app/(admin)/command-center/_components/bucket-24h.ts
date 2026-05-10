/**
 * Sprint 45/46 — server-side bucketing helper.
 *
 * Takes a flat list of timestamped events and bins them into 24
 * hourly buckets ending at "now," oldest-first. Used by:
 *   - Vivid stat card sparklines (one bucket array per metric).
 *   - The brushable activity chart (multi-series stacked).
 *
 * Buckets are absolute hour boundaries within the 24h window — they
 * stay stable across re-renders because we round down to the hour.
 * That means the very first / last bucket may be a partial hour
 * (since "now" is not on a clean :00); the chart treats that as
 * fine.
 */

export interface HourlyBucket {
  /** Hour-start timestamp (ms). */
  t: number;
  /** Count of events that landed in this hour. */
  n: number;
}

const BUCKETS = 24;
const HOUR_MS = 60 * 60 * 1000;

export function bucket24h(events: Array<{ at: Date | null }>): HourlyBucket[] {
  const now = Date.now();
  // Anchor end of last bucket at the top of the current hour + 1h
  // (so "now" lands inside the most-recent bucket).
  const lastHourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const firstHourStart = lastHourStart - (BUCKETS - 1) * HOUR_MS;
  const buckets: HourlyBucket[] = Array.from({ length: BUCKETS }, (_, i) => ({
    t: firstHourStart + i * HOUR_MS,
    n: 0,
  }));
  for (const e of events) {
    if (!e.at) continue;
    const ms = e.at.getTime();
    const idx = Math.floor((ms - firstHourStart) / HOUR_MS);
    if (idx >= 0 && idx < BUCKETS) buckets[idx]!.n++;
  }
  return buckets;
}

/** Convenience: return just the counts. */
export function bucket24hCounts(events: Array<{ at: Date | null }>): number[] {
  return bucket24h(events).map((b) => b.n);
}
