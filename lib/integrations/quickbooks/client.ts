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

// ─────────────────────────────────────────────────────────────────────────────
// Commerce helpers — Customer, Item, Invoice, RecurringTransaction
//
// Every helper returns QboResult<T>. Callers branch on ok and never throw.
// All POSTs use QBO's "sparse update" off-pattern: full object on create.
// ─────────────────────────────────────────────────────────────────────────────

export type QboCustomer = {
  Id: string;
  DisplayName: string;
  PrimaryEmailAddr?: { Address: string };
  CompanyName?: string;
  SyncToken: string;
};

export type QboItem = {
  Id: string;
  Name: string;
  Type: "Service" | "Inventory" | "NonInventory";
  UnitPrice?: number;
  IncomeAccountRef?: { value: string; name?: string };
  SyncToken: string;
};

export type QboInvoice = {
  Id: string;
  DocNumber?: string;
  TotalAmt: number;
  Balance: number;
  CustomerRef: { value: string };
  SyncToken: string;
};

/** Find a Customer by exact PrimaryEmailAddr match. Null if not found. */
export async function findCustomerByEmail(
  email: string,
): Promise<QboResult<QboCustomer | null>> {
  const safe = email.replace(/'/g, "\\'");
  const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${safe}' MAXRESULTS 1`;
  const res = await qboFetch<{ QueryResponse: { Customer?: QboCustomer[] } }>({
    path: "/query",
    query: { query },
  });
  if (!res.ok) return res;
  const customer = res.data.QueryResponse.Customer?.[0] ?? null;
  return { ok: true, data: customer };
}

export async function createCustomer(input: {
  email: string;
  displayName: string;
  companyName?: string | null;
}): Promise<QboResult<QboCustomer>> {
  const body: Record<string, unknown> = {
    DisplayName: input.displayName,
    PrimaryEmailAddr: { Address: input.email },
  };
  if (input.companyName) body.CompanyName = input.companyName;
  const res = await qboFetch<{ Customer: QboCustomer }>({
    method: "POST",
    path: "/customer",
    body,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.Customer };
}

/** Find-or-create idempotently. */
export async function findOrCreateCustomer(input: {
  email: string;
  displayName: string;
  companyName?: string | null;
}): Promise<QboResult<QboCustomer>> {
  const existing = await findCustomerByEmail(input.email);
  if (existing.ok && existing.data) return { ok: true, data: existing.data };
  if (!existing.ok && existing.status !== 0) return existing;
  return createCustomer(input);
}

/** Find an Item by exact Name. */
export async function findItemByName(name: string): Promise<QboResult<QboItem | null>> {
  const safe = name.replace(/'/g, "\\'");
  const query = `SELECT * FROM Item WHERE Name = '${safe}' MAXRESULTS 1`;
  const res = await qboFetch<{ QueryResponse: { Item?: QboItem[] } }>({
    path: "/query",
    query: { query },
  });
  if (!res.ok) return res;
  const item = res.data.QueryResponse.Item?.[0] ?? null;
  return { ok: true, data: item };
}

/** Sync a MacSuite Package to a QBO Item. Idempotent on Name. Requires the
 *  QBO company to have a default income account on file (it always will). */
export async function upsertItem(input: {
  name: string;
  unitPriceCents: number;
  description?: string | null;
}): Promise<QboResult<QboItem>> {
  const existing = await findItemByName(input.name);
  if (!existing.ok && existing.status !== 0) return existing;
  if (existing.ok && existing.data) return { ok: true, data: existing.data };

  // Need an income account to create the Item. Pull the first sales-income
  // account QBO exposes.
  const incomeRes = await qboFetch<{
    QueryResponse: { Account?: Array<{ Id: string; Name: string }> };
  }>({
    path: "/query",
    query: {
      query: "SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 1",
    },
  });
  if (!incomeRes.ok) return incomeRes;
  const income = incomeRes.data.QueryResponse.Account?.[0];
  if (!income) {
    return { ok: false, status: 500, error: "no Income account in QBO" };
  }

  const body: Record<string, unknown> = {
    Name: input.name,
    Type: "Service",
    UnitPrice: input.unitPriceCents / 100,
    IncomeAccountRef: { value: income.Id, name: income.Name },
  };
  if (input.description) body.Description = input.description;

  const res = await qboFetch<{ Item: QboItem }>({
    method: "POST",
    path: "/item",
    body,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.Item };
}

export async function createInvoice(input: {
  customerId: string;
  itemId: string;
  itemName: string;
  unitPriceCents: number;
  quantity?: number;
  buyerEmail: string;
  /** True → QBO sends its own "Invoice / Pay Now" email to the buyer
   *  with the hosted payment link. */
  emailInvoice?: boolean;
}): Promise<QboResult<QboInvoice>> {
  const body: Record<string, unknown> = {
    CustomerRef: { value: input.customerId },
    Line: [
      {
        DetailType: "SalesItemLineDetail",
        Amount: (input.unitPriceCents / 100) * (input.quantity ?? 1),
        SalesItemLineDetail: {
          ItemRef: { value: input.itemId, name: input.itemName },
          Qty: input.quantity ?? 1,
          UnitPrice: input.unitPriceCents / 100,
        },
      },
    ],
    BillEmail: { Address: input.buyerEmail },
    AllowOnlineCreditCardPayment: true,
    AllowOnlineACHPayment: true,
  };
  const res = await qboFetch<{ Invoice: QboInvoice }>({
    method: "POST",
    path: "/invoice",
    body,
    query: input.emailInvoice ? { include: "invoiceLink" } : undefined,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.Invoice };
}

/** QBO doesn't return a stable "pay this invoice" URL via the API. The
 *  standard approach is to email the customer the invoice (QBO renders
 *  its own hosted payment page and sends the link). We trigger that via
 *  sendInvoice. */
export async function sendInvoice(invoiceId: string, email: string): Promise<QboResult<true>> {
  const res = await qboFetch<unknown>({
    method: "POST",
    path: `/invoice/${invoiceId}/send`,
    query: { sendTo: email },
  });
  if (!res.ok) return res;
  return { ok: true, data: true };
}

export type QboRecurringTransaction = {
  Id: string;
  Name: string;
  SyncToken: string;
};

/** Recurring template that issues a fresh Invoice on every cycle.
 *  Used for monthly/annual subscriptions. */
export async function createRecurringInvoice(input: {
  name: string;
  customerId: string;
  itemId: string;
  itemName: string;
  unitPriceCents: number;
  buyerEmail: string;
  intervalType: "Daily" | "Weekly" | "Monthly" | "Yearly";
  numInterval: number;
}): Promise<QboResult<QboRecurringTransaction>> {
  const body = {
    RecurringTransaction: [
      {
        Invoice: {
          Name: input.name,
          RecurringInfo: {
            Name: input.name,
            RecurType: "Automated",
            Active: true,
            ScheduleInfo: {
              IntervalType: input.intervalType,
              NumInterval: input.numInterval,
              StartDate: new Date().toISOString().split("T")[0],
            },
          },
          CustomerRef: { value: input.customerId },
          Line: [
            {
              DetailType: "SalesItemLineDetail",
              Amount: input.unitPriceCents / 100,
              SalesItemLineDetail: {
                ItemRef: { value: input.itemId, name: input.itemName },
                Qty: 1,
                UnitPrice: input.unitPriceCents / 100,
              },
            },
          ],
          BillEmail: { Address: input.buyerEmail },
          AllowOnlineCreditCardPayment: true,
          AllowOnlineACHPayment: true,
        },
      },
    ],
  };

  const res = await qboFetch<{ RecurringTransaction: QboRecurringTransaction[] }>({
    method: "POST",
    path: "/recurringtransaction",
    body,
  });
  if (!res.ok) return res;
  const rt = res.data.RecurringTransaction[0];
  if (!rt) return { ok: false, status: 500, error: "QBO returned empty RecurringTransaction array" };
  return { ok: true, data: rt };
}

/** Read a single Invoice — used by the in-suite "Receive Payment" flow to
 *  show the operator the live open balance (which may differ from the
 *  Order total after partial payments). */
export async function getInvoice(invoiceId: string): Promise<QboResult<QboInvoice>> {
  const res = await qboFetch<{ Invoice: QboInvoice }>({ path: `/invoice/${invoiceId}` });
  if (!res.ok) return res;
  return { ok: true, data: res.data.Invoice };
}

export type QboPayment = {
  Id: string;
  TotalAmt: number;
  TxnDate?: string;
  CustomerRef?: { value: string };
  SyncToken: string;
};

/** Create an *accounting* Payment that applies against an Invoice and
 *  closes it in QBO. This is the books-of-record entry — used both for
 *  manually-recorded payments (check/cash/ACH) and to settle a card/ACH
 *  charge taken through the Payments API.
 *
 *  Linking via `LinkedTxn` of type "Invoice" is what marks the invoice
 *  PAID. We deliberately omit DepositToAccountRef so QBO routes it to the
 *  company's default (Undeposited Funds), matching the QBO UI's behavior. */
export async function createPayment(input: {
  customerId: string;
  invoiceId: string;
  amountCents: number;
  /** YYYY-MM-DD. Defaults to today in QBO if omitted. */
  txnDate?: string | null;
  /** Free-text reference (check number, charge id, etc.). */
  paymentRefNum?: string | null;
  /** Note stored on the QBO Payment — we use it to record the method and
   *  that it originated in MacTech Suite. */
  privateNote?: string | null;
}): Promise<QboResult<QboPayment>> {
  const amount = input.amountCents / 100;
  const body: Record<string, unknown> = {
    CustomerRef: { value: input.customerId },
    TotalAmt: amount,
    Line: [
      {
        Amount: amount,
        LinkedTxn: [{ TxnId: input.invoiceId, TxnType: "Invoice" }],
      },
    ],
  };
  if (input.txnDate) body.TxnDate = input.txnDate;
  if (input.paymentRefNum) body.PaymentRefNum = input.paymentRefNum.slice(0, 21);
  if (input.privateNote) body.PrivateNote = input.privateNote;

  const res = await qboFetch<{ Payment: QboPayment }>({
    method: "POST",
    path: "/payment",
    body,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data.Payment };
}
