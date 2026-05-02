/**
 * Bearer/key auth for the public surface (`/api/v1/*` and `/api/audit/ingest`).
 *
 * Keys live in the `ApiKey` table — SHA-256 hashed at rest, with an explicit
 * scope set, revocable, and tracking `lastUsedAt`. Issued + managed via
 * `/admin/api-keys`. Each scope (`audit_ingest`, `org_read`,
 * `user_access_read`, `webhook_send`) is enforced per-route.
 *
 * The original deployment also accepted `AUDIT_INGEST_API_KEY` from env as
 * a "legacy all-scopes" fallback so sibling apps could onboard without
 * waiting for the per-app key rollout. That fallback was removed once all
 * sibling apps rotated to DB-issued keys; revocation in the DB now
 * actually takes effect.
 *
 * Sibling apps send the key in `X-MacTech-Audit-Key` (preferred) or as a
 * `Bearer` token in `Authorization`. We accept either for ergonomic reasons.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
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
