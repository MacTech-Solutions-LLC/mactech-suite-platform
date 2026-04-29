/**
 * Shared bearer/key auth for the public `/api/v1/*` surface that sibling
 * apps consume. Reuses the same `AUDIT_INGEST_API_KEY` so each MacTech
 * app only needs one secret to talk to the central hub.
 *
 * Future enhancement: per-app keys with scopes (read-only vs read-write,
 * which apps can read which orgs, etc.). For now, the key is shared and
 * grants read access to org + entitlement metadata only.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env, auditIngestionConfigured } from "./env";

export interface ApiAuthFailure {
  ok: false;
  response: NextResponse;
}
export interface ApiAuthSuccess {
  ok: true;
}

export function requireApiKey(request: NextRequest): ApiAuthFailure | ApiAuthSuccess {
  if (!auditIngestionConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Public API is not configured on this server." },
        { status: 503 },
      ),
    };
  }
  const provided =
    request.headers.get("x-mactech-audit-key") ??
    request.headers.get("X-MacTech-Audit-Key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== env.AUDIT_INGEST_API_KEY) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized: invalid or missing API key." },
        { status: 401 },
      ),
    };
  }
  return { ok: true };
}
