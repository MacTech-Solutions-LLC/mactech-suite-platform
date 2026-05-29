/**
 * QuickBooks Online OAuth 2.0 helpers.
 *
 * Intuit's OAuth flow is standard authorization-code: we build an
 * authorization URL, the user signs in + consents, Intuit redirects to
 * our callback with `?code=...&realmId=...&state=...`, we exchange the
 * code for an access + refresh token at the token endpoint.
 *
 * Tokens are short-lived: access tokens expire in ~1 hour, refresh tokens
 * in 100 days from issuance. Every successful refresh issues a new
 * refresh token (the old one stays valid for 24h to allow retries), so
 * we persist the latest pair on every refresh.
 *
 * Endpoint reference:
 *   https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
 */

import { env } from "@/lib/env";

const AUTH_BASE = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL =
  "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

/** Scopes we request. Accounting covers Customers, Items, Invoices,
 *  Payments, RecurringTransactions. Add `openid profile email` if we
 *  ever surface the connected Intuit user identity. */
export const QBO_SCOPES = "com.intuit.quickbooks.accounting";

export type QboTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: "bearer";
  // Not always present, but Intuit returns it for some scope sets.
  id_token?: string;
};

export function buildAuthorizationUrl(state: string): string {
  if (!env.QBO_CLIENT_ID || !env.QBO_REDIRECT_URI) {
    throw new Error(
      "[qbo/oauth] QBO_CLIENT_ID and QBO_REDIRECT_URI must be configured.",
    );
  }
  const params = new URLSearchParams({
    client_id: env.QBO_CLIENT_ID,
    response_type: "code",
    scope: QBO_SCOPES,
    redirect_uri: env.QBO_REDIRECT_URI,
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

function basicAuthHeader(): string {
  if (!env.QBO_CLIENT_ID || !env.QBO_CLIENT_SECRET) {
    throw new Error(
      "[qbo/oauth] QBO_CLIENT_ID and QBO_CLIENT_SECRET must be configured.",
    );
  }
  const creds = `${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(creds, "utf8").toString("base64")}`;
}

export async function exchangeCodeForTokens(code: string): Promise<QboTokenResponse> {
  if (!env.QBO_REDIRECT_URI) {
    throw new Error("[qbo/oauth] QBO_REDIRECT_URI must be configured.");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.QBO_REDIRECT_URI,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[qbo/oauth] code exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as QboTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<QboTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[qbo/oauth] refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as QboTokenResponse;
}

/** Best-effort revoke. We don't surface failures because the user has
 *  already chosen to disconnect — we just delete the local row either way. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: basicAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: refreshToken }),
    });
  } catch {
    // swallow — caller is disconnecting anyway
  }
}
