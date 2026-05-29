/**
 * HMAC verifier for inbound requests from the marketing site.
 *
 * Header: X-Mactech-Signature: sha256=<hex>
 * Body: raw request bytes
 * Key: MARKETING_SITE_HMAC_SECRET
 *
 * Same constant-time-compare pattern as the GitHub webhook verifier so
 * a future audit doesn't have to wonder which one to trust.
 */

import { createHmac, timingSafeEqual } from "crypto";

export type MarketingVerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "no_secret" | "no_signature" | "bad_format" | "mismatch" };

export function verifyMarketingSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): MarketingVerifyOutcome {
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!signatureHeader) return { ok: false, reason: "no_signature" };
  if (!signatureHeader.startsWith("sha256=")) return { ok: false, reason: "bad_format" };

  const provided = signatureHeader.slice("sha256=".length).trim();
  if (provided.length !== 64) return { ok: false, reason: "bad_format" };

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  if (expected.length !== provided.length) return { ok: false, reason: "mismatch" };
  const ok = timingSafeEqual(Buffer.from(expected, "ascii"), Buffer.from(provided, "ascii"));
  return ok ? { ok: true } : { ok: false, reason: "mismatch" };
}
