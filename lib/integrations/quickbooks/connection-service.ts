/**
 * Single-row connection service for the MacTech QuickBooks Online company.
 *
 * MacSuite bills every customer through one QBO realm — MacTech's own
 * company. We don't multiplex across customer realms. The DB therefore
 * holds at most one *active* QuickbooksConnection row at a time.
 *
 * The store is intentionally narrow: get the live connection, persist a
 * fresh token pair, rotate via refresh when the access token has expired
 * (or is within a small skew window). The QBO REST client wraps this with
 * a request-and-retry-on-401 loop.
 */

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptToken, encryptToken } from "./encryption";
import { refreshAccessToken, QBO_PAYMENTS_SCOPE, type QboTokenResponse } from "./oauth";
import type { QuickbooksConnection, QuickbooksEnvironment } from "@prisma/client";

/** Refresh proactively if the access token has < 5 minutes of life left. */
const ACCESS_REFRESH_SKEW_MS = 5 * 60 * 1000;

export type LiveConnection = {
  id: string;
  realmId: string;
  environment: QuickbooksEnvironment;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  companyName: string | null;
  scope: string | null;
};

export async function getActiveConnection(): Promise<QuickbooksConnection | null> {
  return prisma.quickbooksConnection.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

/** Upserts a connection for `realmId`, encrypting the tokens. Used by
 *  the OAuth callback (new connection) and the refresh path (rotation). */
export async function persistTokens(input: {
  realmId: string;
  environment: QuickbooksEnvironment;
  tokens: QboTokenResponse;
  connectedByClerkUserId?: string | null;
  companyName?: string | null;
  /** The scopes the user granted at consent. Pass this ONLY from the OAuth
   *  callback (where consent just happened). The refresh path must omit it
   *  — a token refresh never changes the granted scope, so we preserve the
   *  stored value rather than overwrite it. */
  scope?: string | null;
}): Promise<QuickbooksConnection> {
  const now = Date.now();
  const accessTokenExpiresAt = new Date(now + input.tokens.expires_in * 1000);
  const refreshTokenExpiresAt = new Date(
    now + input.tokens.x_refresh_token_expires_in * 1000,
  );
  const accessTokenCipher = encryptToken(input.tokens.access_token);
  const refreshTokenCipher = encryptToken(input.tokens.refresh_token);

  // Deactivate any other rows so we maintain the "at most one active"
  // invariant. A second connection should only ever exist if an operator
  // is reconnecting to a different realm.
  await prisma.quickbooksConnection.updateMany({
    where: { realmId: { not: input.realmId }, isActive: true },
    data: { isActive: false },
  });

  return prisma.quickbooksConnection.upsert({
    where: { realmId: input.realmId },
    create: {
      realmId: input.realmId,
      environment: input.environment,
      accessTokenCipher,
      refreshTokenCipher,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      scope: input.scope ?? null,
      companyName: input.companyName ?? null,
      connectedByClerkUserId: input.connectedByClerkUserId ?? null,
      lastRefreshedAt: new Date(),
      isActive: true,
    },
    update: {
      environment: input.environment,
      accessTokenCipher,
      refreshTokenCipher,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      // Only overwrite scope when the caller explicitly supplies it (a new
      // consent). undefined leaves the stored grant untouched on refresh.
      scope: input.scope ?? undefined,
      companyName: input.companyName ?? undefined,
      connectedByClerkUserId: input.connectedByClerkUserId ?? undefined,
      lastRefreshedAt: new Date(),
      lastErrorMessage: null,
      isActive: true,
    },
  });
}

/** Marks a refresh failure on the row so the admin UI can surface it. */
export async function recordRefreshError(connectionId: string, message: string) {
  await prisma.quickbooksConnection.update({
    where: { id: connectionId },
    data: { lastErrorMessage: message },
  });
}

export async function deactivateConnection(connectionId: string) {
  await prisma.quickbooksConnection.update({
    where: { id: connectionId },
    data: { isActive: false },
  });
}

/** Loads the live connection, refreshing the access token if it's expired
 *  or near-expired. Returns decrypted tokens ready for an API call. */
export async function getLiveConnection(): Promise<LiveConnection | null> {
  const row = await getActiveConnection();
  if (!row) return null;

  const needsRefresh =
    row.accessTokenExpiresAt.getTime() - Date.now() < ACCESS_REFRESH_SKEW_MS;

  if (!needsRefresh) {
    return {
      id: row.id,
      realmId: row.realmId,
      environment: row.environment,
      accessToken: decryptToken(row.accessTokenCipher),
      refreshToken: decryptToken(row.refreshTokenCipher),
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt,
      companyName: row.companyName,
      scope: row.scope,
    };
  }

  // Refresh path
  const oldRefresh = decryptToken(row.refreshTokenCipher);
  try {
    const fresh = await refreshAccessToken(oldRefresh);
    const updated = await persistTokens({
      realmId: row.realmId,
      environment: row.environment,
      tokens: fresh,
      companyName: row.companyName,
    });
    return {
      id: updated.id,
      realmId: updated.realmId,
      environment: updated.environment,
      accessToken: fresh.access_token,
      refreshToken: fresh.refresh_token,
      accessTokenExpiresAt: updated.accessTokenExpiresAt,
      refreshTokenExpiresAt: updated.refreshTokenExpiresAt,
      companyName: updated.companyName,
      scope: updated.scope,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await recordRefreshError(row.id, message);
    throw err;
  }
}

/** Resolves the QBO API base URL for the configured environment. The
 *  realmId is appended to every accounting endpoint:
 *  `{base}/v3/company/{realmId}/...`. */
export function apiBaseUrl(): string {
  return env.QBO_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

/** Base URL for the QuickBooks *Payments* API (charges, echecks, tokens).
 *  This is a different gateway host than the accounting API above. */
export function paymentsApiBaseUrl(): string {
  return env.QBO_ENV === "production"
    ? "https://api.intuit.com"
    : "https://sandbox.api.intuit.com";
}

/** True when the active connection's granted scope includes the Payments
 *  scope. Used to decide whether the in-suite "Charge new payment" flow is
 *  available, or whether the operator must reconnect QuickBooks first. */
export async function connectionHasPaymentsScope(): Promise<boolean> {
  const row = await getActiveConnection();
  return Boolean(row?.scope?.includes(QBO_PAYMENTS_SCOPE));
}
