/**
 * QuickBooks *Payments* API client — live card & ACH charges.
 *
 * This is a different gateway than the accounting API (`client.ts`):
 *   base: https://api.intuit.com            (production)
 *         https://sandbox.api.intuit.com    (sandbox)
 *   auth: the SAME OAuth bearer token as accounting, but the connection
 *         must have been granted the `com.intuit.quickbooks.payments`
 *         scope (see oauth.ts / connectionHasPaymentsScope).
 *
 * PCI posture: we never receive raw card/bank numbers here. The browser
 * tokenizes the instrument directly against Intuit's public tokens
 * endpoint and sends us only an opaque, single-use `token`. This client
 * charges that token. Raw PANs never touch our server or our logs.
 *
 * Idempotency: every charge sends a `Request-Id` header. Intuit dedupes
 * retries with the same Request-Id within a short window, so a network
 * retry can't double-charge a customer.
 *
 * Docs: https://developer.intuit.com/app/developer/qbpayments/docs/api/resources/all-entities/charges
 */

import { getLiveConnection, paymentsApiBaseUrl } from "./connection-service";

export type ChargeOk = {
  ok: true;
  /** Payments-API transaction id (NOT the accounting Payment id). */
  chargeId: string;
  /** CAPTURED for cards; PENDING for ACH echecks. */
  status: string;
  authCode?: string;
  /** Last 4 of the instrument, masked by Intuit (e.g. "xxxxxxxxxxxx1111"). */
  last4?: string;
  brand?: string;
};

export type ChargeErr = {
  ok: false;
  status: number;
  /** Human-readable message suitable for surfacing to the operator. */
  error: string;
  /** Intuit error code, e.g. "PMT-4000" (validation) or a decline code. */
  code?: string;
  /** True when the processor declined an otherwise well-formed request
   *  (vs. an auth/config error) — lets the UI phrase it as a decline. */
  declined?: boolean;
};

export type ChargeResult = ChargeOk | ChargeErr;

type IntuitError = {
  errors?: Array<{
    code?: string;
    type?: string;
    message?: string;
    detail?: string;
  }>;
};

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Shared POST against the Payments API with bearer auth + Request-Id. */
async function paymentsPost<T>(
  path: string,
  body: unknown,
  requestId: string,
): Promise<{ ok: true; data: T } | ChargeErr> {
  const conn = await getLiveConnection();
  if (!conn) {
    return { ok: false, status: 0, error: "QuickBooks is not connected." };
  }

  let res: Response;
  try {
    res = await fetch(`${paymentsApiBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${conn.accessToken}`,
        "Request-Id": requestId,
        "Company-Id": conn.realmId,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "network error";
    return { ok: false, status: 0, error: `Could not reach QuickBooks Payments: ${message}` };
  }

  const text = await res.text();

  if (!res.ok) {
    let code: string | undefined;
    let message = `QuickBooks Payments error (${res.status}).`;
    try {
      const parsed = JSON.parse(text) as IntuitError;
      const first = parsed.errors?.[0];
      if (first) {
        code = first.code;
        message = first.detail || first.message || message;
      }
    } catch {
      if (text) message = text.slice(0, 300);
    }
    // 4xx that isn't auth/permission is effectively a decline / validation.
    const declined = res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403;
    return { ok: false, status: res.status, error: message, code, declined };
  }

  return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
}

type CardChargeResponse = {
  id: string;
  status: string;
  authCode?: string;
  card?: { number?: string; cardType?: string };
};

/** Capture a credit-card charge using a token minted client-side. */
export async function chargeCard(input: {
  token: string;
  amountCents: number;
  currency: string;
  requestId: string;
  description?: string;
}): Promise<ChargeResult> {
  const res = await paymentsPost<CardChargeResponse>(
    "/quickbooks/v4/payments/charges",
    {
      amount: dollars(input.amountCents),
      currency: input.currency,
      token: input.token,
      capture: true,
      context: { mobile: false, isEcommerce: true },
      ...(input.description ? { description: input.description } : {}),
    },
    input.requestId,
  );
  if (!res.ok) return res;
  const d = res.data;
  // A capture that comes back DECLINED still returns HTTP 201 with a status.
  if (d.status && d.status.toUpperCase() === "DECLINED") {
    return { ok: false, status: 402, error: "The card was declined.", declined: true };
  }
  return {
    ok: true,
    chargeId: d.id,
    status: d.status,
    authCode: d.authCode,
    last4: d.card?.number?.slice(-4),
    brand: d.card?.cardType,
  };
}

type EcheckChargeResponse = {
  id: string;
  status: string;
  bankAccount?: { accountNumber?: string };
};

/** Debit a bank account (ACH) using a token minted client-side. ACH
 *  settles asynchronously, so a successful request returns PENDING — the
 *  funds clear days later. We still record + provision on PENDING because
 *  reversals are rare and handled via the webhook/refund path. */
export async function chargeEcheck(input: {
  token: string;
  amountCents: number;
  requestId: string;
}): Promise<ChargeResult> {
  const res = await paymentsPost<EcheckChargeResponse>(
    "/quickbooks/v4/payments/echecks",
    {
      amount: dollars(input.amountCents),
      token: input.token,
      paymentMode: "WEB",
    },
    input.requestId,
  );
  if (!res.ok) return res;
  const d = res.data;
  if (d.status && d.status.toUpperCase() === "DECLINED") {
    return { ok: false, status: 402, error: "The bank transfer was declined.", declined: true };
  }
  return {
    ok: true,
    chargeId: d.id,
    status: d.status,
    last4: d.bankAccount?.accountNumber?.slice(-4),
    brand: "Bank account",
  };
}
