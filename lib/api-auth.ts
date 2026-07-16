/**
 * Bearer/key auth for the public surface (`/api/v1/*`, `/api/audit/ingest`,
 * and `/api/hub/audit/events`).
 *
 * Keys live in the `ApiKey` table — SHA-256 hashed at rest, with an explicit
 * scope set, revocable, and tracking `lastUsedAt`. Issued + managed via
 * `/admin/api-keys`. Scopes are enforced per-route; see `lib/api-key-scopes.ts`
 * for the catalog of what each one grants.
 *
 * Note `requireApiKey` does not check the key's `appKey` tag — it returns it
 * only for audit attribution. Routes that need the caller's app identity bound
 * to the key must use `verifyHubServiceRequest` (lib/hub-authority.ts) or
 * `verifyAuditServiceRequest` (lib/hub-audit.ts), which enforce the match.
 *
 * The original deployment also accepted `AUDIT_INGEST_API_KEY` from env as
 * a "legacy all-scopes" fallback so sibling apps could onboard without
 * waiting for the per-app key rollout. That fallback was removed once all
 * sibling apps rotated to DB-issued keys; revocation in the DB now
 * actually takes effect.
 *
 * Sibling apps send the key in `X-MacTech-Service-Token`,
 * `X-MacTech-Audit-Key` (legacy), or as a `Bearer` token in `Authorization`.
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
  const serviceHeader = request.headers.get("x-mactech-service-token");
  if (serviceHeader) return serviceHeader;
  const header = request.headers.get("x-mactech-audit-key");
  if (header) return header;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

/**
 * Require an API key with the given scope. Pass the scope appropriate to
 * the route — e.g. `org_read` for /api/v1/orgs, `audit_ingest` for
 * /api/hub/audit/events.
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
