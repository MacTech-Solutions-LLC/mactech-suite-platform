import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies an inbound GitHub webhook against the
 * `X-Hub-Signature-256` header. Constant-time comparison; never
 * branches on the signature contents. Returns a discriminated
 * outcome so the route can audit-log the failure mode.
 *
 * GitHub sends `sha256=<hex>`. The body MUST be the raw bytes the
 * route received — re-serializing JSON before HMAC will fail.
 */

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "no_secret" | "no_signature" | "bad_format" | "mismatch" };

export function verifyGitHubSignature(
  rawBody: ArrayBuffer | Uint8Array,
  signatureHeader: string | null,
  secret: string | undefined,
): VerifyOutcome {
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!signatureHeader) return { ok: false, reason: "no_signature" };
  if (!signatureHeader.startsWith("sha256=")) return { ok: false, reason: "bad_format" };

  const provided = signatureHeader.slice("sha256=".length).trim();
  if (provided.length !== 64) return { ok: false, reason: "bad_format" };

  const bodyBuf = rawBody instanceof Uint8Array ? rawBody : new Uint8Array(rawBody);
  const expected = createHmac("sha256", secret).update(bodyBuf).digest("hex");

  if (expected.length !== provided.length) return { ok: false, reason: "mismatch" };
  const ok = timingSafeEqual(Buffer.from(expected, "ascii"), Buffer.from(provided, "ascii"));
  return ok ? { ok: true } : { ok: false, reason: "mismatch" };
}
