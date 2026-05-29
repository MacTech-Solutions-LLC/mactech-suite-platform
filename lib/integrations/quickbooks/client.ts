/**
 * Thin QBO REST client. Resolves the live (auto-refreshed) connection,
 * makes the request, and retries once on 401 in case the token expired
 * inside the request window. Errors return typed outcomes so callers can
 * branch without try/catch noise.
 *
 * Phase 1 ships only the primitives the admin UI needs to verify the
 * connection (CompanyInfo lookup). Customer/Item/Invoice helpers land in
 * Phase 2 when checkout goes live.
 */

import { apiBaseUrl, getLiveConnection } from "./connection-service";

export type QboFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Path *under* /v3/company/{realmId} — e.g. "/companyinfo/{realmId}". */
  path: string;
  /** Query-string params to append. */
  query?: Record<string, string | number | undefined>;
  /** JSON body for POST/PUT. */
  body?: unknown;
};

export type QboResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }
  | { ok: false; status: 0; error: "not_connected" };

export async function qboFetch<T>(opts: QboFetchOptions): Promise<QboResult<T>> {
  const connection = await getLiveConnection();
  if (!connection) {
    return { ok: false, status: 0, error: "not_connected" };
  }

  const url = buildUrl(connection.realmId, opts.path, opts.query);

  const doRequest = async (token: string) =>
    fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let res = await doRequest(connection.accessToken);

  // Re-fetch connection (forcing a refresh) on a 401 — covers the case
  // where the token expired between our skew check and the request.
  if (res.status === 401) {
    const fresh = await getLiveConnection();
    if (fresh && fresh.accessToken !== connection.accessToken) {
      res = await doRequest(fresh.accessToken);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text };
  }

  const data = (await res.json()) as T;
  return { ok: true, data };
}

function buildUrl(
  realmId: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams();
  // QBO requires minorversion on every call; pin a known-supported one.
  params.set("minorversion", "73");
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) params.set(k, String(v));
  }
  return `${apiBaseUrl()}/v3/company/${realmId}${cleanPath}?${params.toString()}`;
}

/** Lightweight liveness probe used by /admin/quickbooks to confirm the
 *  stored tokens still talk to QBO. */
export type QboCompanyInfo = {
  CompanyInfo: {
    CompanyName: string;
    LegalName?: string;
    Country?: string;
    Email?: { Address?: string };
  };
};

export async function fetchCompanyInfo(): Promise<QboResult<QboCompanyInfo>> {
  const connection = await getLiveConnection();
  if (!connection) return { ok: false, status: 0, error: "not_connected" };
  return qboFetch<QboCompanyInfo>({
    path: `/companyinfo/${connection.realmId}`,
  });
}
