/**
 * QuickBooks Online webhook signature verification.
 *
 * Intuit signs every webhook POST with `X-Intuit-Signature`, an
 * HMAC-SHA256 of the *raw* request body keyed by the app's verifier
 * token. The header is base64-encoded.
 *
 *   header = base64( HMAC-SHA256( verifierToken, rawBody ) )
 *
 * The body MUST be the bytes as received — re-serializing will fail.
 *
 * Reference:
 *   https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
 */

import { createHmac, timingSafeEqual } from "crypto";

export type QboVerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "no_secret" | "no_signature" | "mismatch" };

export function verifyQuickbooksSignature(
  rawBody: ArrayBuffer | Uint8Array | string,
  signatureHeader: string | null,
  verifierToken: string | undefined,
): QboVerifyOutcome {
  if (!verifierToken) return { ok: false, reason: "no_secret" };
  if (!signatureHeader) return { ok: false, reason: "no_signature" };

  const bodyBuf =
    typeof rawBody === "string"
      ? Buffer.from(rawBody, "utf8")
      : rawBody instanceof Uint8Array
        ? Buffer.from(rawBody)
        : Buffer.from(new Uint8Array(rawBody));

  const expected = createHmac("sha256", verifierToken).update(bodyBuf).digest("base64");

  if (expected.length !== signatureHeader.length) {
    return { ok: false, reason: "mismatch" };
  }

  const ok = timingSafeEqual(
    Buffer.from(expected, "ascii"),
    Buffer.from(signatureHeader, "ascii"),
  );
  return ok ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** Shape of the JSON QBO posts on every webhook delivery. We don't
 *  unmarshal it strictly — just enough to extract realmId + an event
 *  type tag for triage and idempotency. */
export type QboWebhookPayload = {
  eventNotifications?: Array<{
    realmId?: string;
    dataChangeEvent?: {
      entities?: Array<{
        name?: string;
        id?: string;
        operation?: string;
        lastUpdated?: string;
      }>;
    };
  }>;
};

/** Best-effort summary extracted from the payload for logging + filtering. */
export function summarizeWebhookPayload(payload: QboWebhookPayload): {
  realmId: string | null;
  eventType: string | null;
} {
  const first = payload.eventNotifications?.[0];
  const realmId = first?.realmId ?? null;
  const entity = first?.dataChangeEvent?.entities?.[0];
  const eventType = entity ? `${entity.name ?? "Unknown"}.${entity.operation ?? "Change"}` : null;
  return { realmId, eventType };
}
