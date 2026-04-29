/**
 * Bearer/key auth for the public surface (`/api/v1/*` and `/api/audit/ingest`).
 *
 * The system supports two key sources, in this priority order:
 *
 * 1. **Database-issued keys** (`ApiKey` table) — preferred. Each key is
 *    SHA-256 hashed at rest, has an explicit scope set, can be revoked,
 *    and tracks `lastUsedAt`. Issued via `/admin/api-keys`.
 *
 * 2. **Legacy env-var key** (`AUDIT_INGEST_API_KEY`) — backward-compat path
 *    for the original "single shared secret" model used while sibling apps
 *    were being onboarded. Treated as having ALL scopes. Mark as deprecated
 *    via the dashboard once every consumer has rotated to a DB-issued key.
 *
 * Sibling apps send the key in `X-MacTech-Audit-Key` (preferred) or as a
 * `Bearer` token in `Authorization`. We accept either for ergonomic reasons.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env, auditIngestionConfigured } from "./env";
import { verifyApiKey } from "./services/api-key-service";
import type { ApiKeyScope } from "@prisma/client";

export interface ApiAuthFailure {
  ok: false;
  response: NextResponse;
}
export interface ApiAuthSuccess {
  ok: true;
  /** Issued-key id when authed via the DB; null when via the legacy env var. */
  apiKeyId: string | null;
  /** Friendly key name for audit logs. */
  apiKeyName: string;
  /** App tag the issued key carries, when present. */
  apiKeyApp: string | null;
}

function extractKey(request: NextRequest): string | null {
  const header = request.headers.get("x-mactech-audit-key");
  if (header) return header;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

/**
 * Require an API key with the given scope. Pass the scope appropriate to
 * the route — e.g. `org_read` for /api/v1/orgs, `audit_ingest` for
 * /api/audit/ingest.
 */
export async function requireApiKey(
  request: NextRequest,
  scope: ApiKeyScope,
): Promise<ApiAuthFailure | ApiAuthSuccess> {
  const provided = extractKey(request);

  // Database lookup first.
  if (provided) {
    const key = await verifyApiKey(provided, scope);
    if (key) {
      return {
        ok: true,
        apiKeyId: key.id,
        apiKeyName: key.name,
        apiKeyApp: key.appKey,
      };
    }
  }

  // Legacy env-var key — full scope, but only when configured.
  if (
    auditIngestionConfigured() &&
    provided &&
    provided === env.AUDIT_INGEST_API_KEY
  ) {
    return {
      ok: true,
      apiKeyId: null,
      apiKeyName: "legacy:AUDIT_INGEST_API_KEY",
      apiKeyApp: null,
    };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "Unauthorized",
        detail: provided
          ? "Key is invalid, revoked, expired, or missing required scope."
          : "Missing X-MacTech-Audit-Key (or Authorization: Bearer …) header.",
      },
      { status: 401 },
    ),
  };
}
