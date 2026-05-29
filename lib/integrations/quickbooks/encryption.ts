/**
 * AES-256-GCM token cipher for QuickBooks OAuth tokens.
 *
 * Tokens land in the database as `iv:tag:ciphertext` (all base64), each
 * field separated by a colon. Decryption verifies the GCM auth tag, so
 * any tampering with the stored bytes fails closed.
 *
 * Key material is supplied via QBO_ENCRYPTION_KEY. We accept the key as
 * base64, hex, or raw UTF-8 — the parser normalizes whichever the operator
 * pasted. The key must decode to exactly 32 bytes (AES-256).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function parseKey(raw: string): Buffer {
  // base64
  const b64 = tryDecode(raw, "base64");
  if (b64?.length === KEY_BYTES) return b64;
  // hex
  const hex = tryDecode(raw, "hex");
  if (hex?.length === KEY_BYTES) return hex;
  // raw utf-8
  const utf = Buffer.from(raw, "utf8");
  if (utf.length === KEY_BYTES) return utf;

  throw new Error(
    `[qbo/encryption] QBO_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got base64=${b64?.length ?? "?"}, hex=${hex?.length ?? "?"}, utf8=${utf.length}). Generate one with: openssl rand -base64 32`,
  );
}

function tryDecode(value: string, encoding: "base64" | "hex"): Buffer | null {
  try {
    const decoded = Buffer.from(value, encoding);
    // Buffer.from is permissive on bad input — round-trip to verify.
    if (decoded.toString(encoding).replace(/=+$/, "") !== value.replace(/=+$/, "")) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (!env.QBO_ENCRYPTION_KEY) {
    throw new Error("[qbo/encryption] QBO_ENCRYPTION_KEY is not configured.");
  }
  cachedKey = parseKey(env.QBO_ENCRYPTION_KEY);
  return cachedKey;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptToken(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("[qbo/encryption] malformed ciphertext (expected iv:tag:ct)");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
