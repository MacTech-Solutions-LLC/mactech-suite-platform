/**
 * In-memory sliding-window rate limiter for the public-API surface.
 *
 * Per-process, per-bucket-key. Suitable for a single Railway replica
 * (which is what we run today). For multi-replica we'd swap in Redis,
 * but the contract — "at most N requests per window" — stays the same.
 *
 * Use:
 *   const result = consumeRateLimit({ key: apiKeyId, limit: 100, windowMs: 60_000 });
 *   if (!result.allowed) return rate429Response(result);
 */

interface Bucket {
  /** Timestamps of recent allowed requests (ms since epoch). */
  hits: number[];
}

const _buckets = new Map<string, Bucket>();
const _MAX_BUCKETS = 50_000;

export interface RateLimitOptions {
  /** Stable identifier — typically the ApiKey row id. Falls back to IP if anonymous. */
  key: string;
  /** Max allowed requests within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  limit: number;
}

export function consumeRateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;

  let bucket = _buckets.get(opts.key);
  if (!bucket) {
    bucket = { hits: [] };
    _buckets.set(opts.key, bucket);
    // Bound memory growth — evict the oldest bucket when we hit the cap.
    if (_buckets.size > _MAX_BUCKETS) {
      const oldest = _buckets.keys().next().value;
      if (oldest) _buckets.delete(oldest);
    }
  }

  // Drop expired hits.
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= opts.limit) {
    const oldest = bucket.hits[0];
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldest + opts.windowMs - now,
      limit: opts.limit,
    };
  }

  bucket.hits.push(now);
  return {
    allowed: true,
    remaining: opts.limit - bucket.hits.length,
    resetMs: opts.windowMs,
    limit: opts.limit,
  };
}

/**
 * Standard 429 response with the X-RateLimit-* headers consumers expect.
 */
import { NextResponse } from "next/server";

export function rate429Response(r: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "rate_limited",
      detail: `Exceeded ${r.limit} requests per window. Retry after ${Math.ceil(r.resetMs / 1000)}s.`,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(r.limit),
        "X-RateLimit-Remaining": "0",
        "Retry-After": String(Math.ceil(r.resetMs / 1000)),
      },
    },
  );
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
  };
}
