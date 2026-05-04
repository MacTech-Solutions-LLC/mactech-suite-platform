/**
 * HMAC-signed client for the EnclaveWatch vault admin endpoint at
 * `${VAULT_ADMIN_BASE_URL}/_admin/allowlist`.
 *
 * Auth (mirror of EnclaveWatch's HmacSignatureVerifier):
 *   X-MacTech-Signature: hex(hmac-sha256(secret, METHOD\nPATH\nDATE\nSHA256(BODY)))
 *   Date:                RFC1123 GMT
 *
 * Replay protection: each grant body carries a UUIDv4 requestId; the
 * vault rejects duplicates within a 120 s TTL. The client never sends
 * the same requestId twice.
 *
 * Failure mode: returns a structured outcome for every error path so the
 * caller (server action) can surface the right toast and audit-log the
 * outcome. Throws only on unexpected programmer errors (e.g. missing
 * env vars), which the server action treats as fail-closed 503.
 */

import { createHash, createHmac } from "crypto";
import type {
  CreateGrantRequest,
  CreateGrantResponse,
  ListGrantsResponse,
  RevokeGrantRequest,
} from "./types";

const TIMEOUT_MS = 5_000;

interface ClientConfig {
  baseUrl: string;
  hmacSecret: string;
}

function readConfig(): ClientConfig | null {
  const baseUrl = process.env.VAULT_ADMIN_BASE_URL?.trim();
  const hmacSecret = process.env.VAULT_ADMIN_HMAC_SECRET?.trim();
  if (!baseUrl || !hmacSecret) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), hmacSecret };
}

function canonicalString(method: string, path: string, dateHeader: string, bodyHashHex: string) {
  return `${method}\n${path}\n${dateHeader}\n${bodyHashHex}`;
}

function sign(secret: string, canonical: string) {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

function bodyHash(body: string | Buffer) {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return createHash("sha256").update(buf).digest("hex");
}

async function signedFetch(
  config: ClientConfig,
  method: "POST" | "GET" | "DELETE",
  path: string,
  body: string,
): Promise<Response> {
  const url = `${config.baseUrl}${path}`;
  const date = new Date().toUTCString();
  const sig = sign(
    config.hmacSecret,
    canonicalString(method, path, date, bodyHash(body)),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Date": date,
        "X-MacTech-Signature": sig,
      },
      body: method === "GET" ? undefined : body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export interface VaultAdminClient {
  createGrant(req: CreateGrantRequest): Promise<{ ok: true; data: CreateGrantResponse } | { ok: false; status: number; data: CreateGrantResponse | null; reason: "unreachable" | "http" }>;
  revokeGrant(grantId: string, req: RevokeGrantRequest): Promise<{ ok: true } | { ok: false; status: number; reason: "unreachable" | "http" | "not_found" }>;
  listGrants(): Promise<{ ok: true; data: ListGrantsResponse } | { ok: false; status: number; reason: "unreachable" | "http" }>;
}

export function getVaultAdminClient(): VaultAdminClient | null {
  const config = readConfig();
  if (!config) return null;
  return {
    async createGrant(req) {
      const body = JSON.stringify(req);
      try {
        const resp = await signedFetch(config, "POST", "/_admin/allowlist", body);
        const data = (await resp.json().catch(() => null)) as CreateGrantResponse | null;
        if (resp.ok) return { ok: true, data: data ?? { ok: true } };
        return { ok: false, status: resp.status, data, reason: "http" };
      } catch {
        return { ok: false, status: 0, data: null, reason: "unreachable" };
      }
    },
    async revokeGrant(grantId, req) {
      const body = JSON.stringify(req);
      try {
        const resp = await signedFetch(
          config,
          "DELETE",
          `/_admin/allowlist/${encodeURIComponent(grantId)}`,
          body,
        );
        if (resp.ok) return { ok: true };
        if (resp.status === 404) return { ok: false, status: 404, reason: "not_found" };
        return { ok: false, status: resp.status, reason: "http" };
      } catch {
        return { ok: false, status: 0, reason: "unreachable" };
      }
    },
    async listGrants() {
      try {
        const resp = await signedFetch(config, "GET", "/_admin/allowlist", "");
        const data = (await resp.json().catch(() => null)) as ListGrantsResponse | null;
        if (resp.ok && data) return { ok: true, data };
        return { ok: false, status: resp.status, reason: "http" };
      } catch {
        return { ok: false, status: 0, reason: "unreachable" };
      }
    },
  };
}
