import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify an inbound Railway webhook delivery.
 *
 * Railway's webhook signing is currently looser than GitHub's — they
 * support per-webhook secrets but don't standardise the header name
 * across project versions. We accept either of:
 *
 *   1. `X-Railway-Signature: sha256=<hex>` — HMAC-SHA256 over the raw
 *      body, same convention as GitHub. Constant-time compared.
 *   2. `?secret=<value>` query string — equality compared to
 *      RAILWAY_WEBHOOK_SECRET. Used when Railway's UI doesn't expose
 *      a per-webhook signing secret.
 *
 * In both cases the secret is RAILWAY_WEBHOOK_SECRET. Failure to
 * verify gets the same `mismatch` outcome regardless of mechanism so a
 * probe can't tell which path was taken.
 */

export type VerifyOutcome =
  | { ok: true; method: "hmac" | "query_secret" }
  | { ok: false; reason: "no_secret" | "no_signature" | "bad_format" | "mismatch" };

export function verifyRailwaySignature(
  rawBody: ArrayBuffer | Uint8Array,
  signatureHeader: string | null,
  querySecret: string | null,
  serverSecret: string | undefined,
): VerifyOutcome {
  if (!serverSecret) return { ok: false, reason: "no_secret" };

  // Path 2 first — it's a single string compare, cheaper than HMAC.
  if (querySecret) {
    if (querySecret.length !== serverSecret.length) {
      return { ok: false, reason: "mismatch" };
    }
    const ok = timingSafeEqual(
      Buffer.from(querySecret, "ascii"),
      Buffer.from(serverSecret, "ascii"),
    );
    return ok ? { ok: true, method: "query_secret" } : { ok: false, reason: "mismatch" };
  }

  // Path 1 — HMAC over raw body.
  if (!signatureHeader) return { ok: false, reason: "no_signature" };
  if (!signatureHeader.startsWith("sha256=")) return { ok: false, reason: "bad_format" };
  const provided = signatureHeader.slice("sha256=".length).trim();
  if (provided.length !== 64) return { ok: false, reason: "bad_format" };

  const buf = rawBody instanceof Uint8Array ? rawBody : new Uint8Array(rawBody);
  const expected = createHmac("sha256", serverSecret).update(buf).digest("hex");
  if (expected.length !== provided.length) return { ok: false, reason: "mismatch" };
  const ok = timingSafeEqual(
    Buffer.from(expected, "ascii"),
    Buffer.from(provided, "ascii"),
  );
  return ok ? { ok: true, method: "hmac" } : { ok: false, reason: "mismatch" };
}
