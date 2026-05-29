/**
 * Checkout-session creation.
 *
 * Marketing site POSTs {packageSku, buyer{email,name,company}} to
 * /api/checkout/sessions. This service:
 *   1. Looks up the active Package by sku
 *   2. Find-or-creates the QBO Customer for the buyer
 *   3. Find-or-creates the QBO Item that mirrors the Package
 *   4. Creates either an Invoice (one-time) or RecurringTransaction template
 *      (monthly/quarterly/annually)
 *   5. Persists an Order row keyed to the QBO Invoice ID for webhook
 *      reconciliation later
 *   6. Triggers QBO to email the buyer the hosted payment link
 *
 * Idempotency: if the caller passes the same idempotencyKey twice, we
 * return the same Order without re-creating QBO records. The marketing
 * site SHOULD pass an idempotency key (e.g. a UUID of the checkout click)
 * so retries on transient failure don't double-bill.
 *
 * Returns the Order id plus the buyer-facing payment status — the
 * marketing site shows a "check your email" confirmation page.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  createInvoice,
  createRecurringInvoice,
  findOrCreateCustomer,
  sendInvoice,
  upsertItem,
} from "@/lib/integrations/quickbooks/client";
import type { BillingCycle, Order, Package } from "@prisma/client";

export type CheckoutInput = {
  packageSku: string;
  buyerEmail: string;
  buyerName?: string | null;
  buyerCompany?: string | null;
  /** Optional caller-supplied idempotency key. When provided, repeated
   *  POSTs with the same key return the original Order. */
  idempotencyKey?: string | null;
};

export type CheckoutResult =
  | {
      ok: true;
      order: { id: string; status: Order["status"]; qboInvoiceId: string | null };
      message: string;
    }
  | { ok: false; status: number; error: string };

const CYCLE_TO_QBO: Record<BillingCycle, { intervalType: "Monthly" | "Yearly"; numInterval: number } | null> = {
  one_time: null,
  monthly: { intervalType: "Monthly", numInterval: 1 },
  quarterly: { intervalType: "Monthly", numInterval: 3 },
  annually: { intervalType: "Yearly", numInterval: 1 },
};

export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  // 1. Idempotency check
  if (input.idempotencyKey) {
    const existing = await prisma.order.findFirst({
      where: {
        metadataJson: { path: ["idempotencyKey"], equals: input.idempotencyKey },
      },
    });
    if (existing) {
      return {
        ok: true,
        order: { id: existing.id, status: existing.status, qboInvoiceId: existing.qboInvoiceId },
        message: "Already processed",
      };
    }
  }

  // 2. Resolve package
  const pkg = await prisma.package.findUnique({ where: { sku: input.packageSku } });
  if (!pkg) {
    return { ok: false, status: 404, error: `Unknown package sku: ${input.packageSku}` };
  }
  if (pkg.status !== "active") {
    return { ok: false, status: 400, error: `Package ${input.packageSku} is not active` };
  }

  // 3. Create the Order placeholder (so we have an id for audit before QBO calls)
  const order = await prisma.order.create({
    data: {
      buyerEmail: input.buyerEmail.toLowerCase(),
      buyerName: input.buyerName ?? null,
      buyerCompany: input.buyerCompany ?? null,
      packageId: pkg.id,
      status: "pending",
      totalCents: pkg.priceCents,
      currency: pkg.currency,
      metadataJson: input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      placedAt: new Date(),
    },
  });

  // 4. QBO Customer
  const customerRes = await findOrCreateCustomer({
    email: input.buyerEmail,
    displayName: input.buyerCompany || input.buyerName || input.buyerEmail,
    companyName: input.buyerCompany,
  });
  if (!customerRes.ok) {
    return await failOrder(order.id, `QBO customer failed: ${customerRes.error}`, customerRes.status);
  }

  // 5. QBO Item (mirrors Package). Idempotent on name.
  const itemRes = await upsertItem({
    name: `${pkg.name} (${pkg.sku})`,
    unitPriceCents: pkg.priceCents,
    description: pkg.description,
  });
  if (!itemRes.ok) {
    return await failOrder(order.id, `QBO item failed: ${itemRes.error}`, itemRes.status);
  }

  // 6. Invoice (one-time) or RecurringTransaction (subscription)
  const cycleConfig = CYCLE_TO_QBO[pkg.billingCycle];
  if (cycleConfig === null) {
    return await issueOneTimeInvoice({ order, pkg, customerId: customerRes.data.Id, itemId: itemRes.data.Id });
  }
  return await issueRecurring({ order, pkg, customerId: customerRes.data.Id, itemId: itemRes.data.Id, cycle: cycleConfig });
}

async function issueOneTimeInvoice(args: {
  order: Order;
  pkg: Package;
  customerId: string;
  itemId: string;
}): Promise<CheckoutResult> {
  const invoiceRes = await createInvoice({
    customerId: args.customerId,
    itemId: args.itemId,
    itemName: `${args.pkg.name} (${args.pkg.sku})`,
    unitPriceCents: args.pkg.priceCents,
    buyerEmail: args.order.buyerEmail,
  });
  if (!invoiceRes.ok) {
    return await failOrder(args.order.id, `QBO invoice failed: ${invoiceRes.error}`, invoiceRes.status);
  }
  const inv = invoiceRes.data;
  await prisma.order.update({
    where: { id: args.order.id },
    data: {
      qboCustomerId: args.customerId,
      qboInvoiceId: inv.Id,
      qboInvoiceDocNumber: inv.DocNumber ?? null,
      status: "payment_pending",
    },
  });
  // Trigger QBO to email the buyer the hosted payment link. We don't
  // surface failures here — the invoice exists either way and ops can
  // re-send manually from QBO.
  await sendInvoice(inv.Id, args.order.buyerEmail);
  await writeAuditLog({
    eventType: "checkout.invoice_issued",
    eventCategory: "system",
    severity: "info",
    action: `Issued invoice ${inv.DocNumber ?? inv.Id} to ${args.order.buyerEmail}`,
    resourceType: "Order",
    resourceId: args.order.id,
    metadata: { qboInvoiceId: inv.Id, packageSku: args.pkg.sku, totalCents: args.pkg.priceCents },
  });
  return {
    ok: true,
    order: { id: args.order.id, status: "payment_pending", qboInvoiceId: inv.Id },
    message: "Invoice emailed. Buyer pays via the QuickBooks hosted link.",
  };
}

async function issueRecurring(args: {
  order: Order;
  pkg: Package;
  customerId: string;
  itemId: string;
  cycle: { intervalType: "Monthly" | "Yearly"; numInterval: number };
}): Promise<CheckoutResult> {
  // QBO's RecurringTransaction generates the *first* invoice on its
  // schedule rather than immediately, so for a "pay now to start
  // subscription" UX we ALSO issue an initial one-time invoice. The
  // recurring template handles every renewal thereafter.
  const firstInvoice = await createInvoice({
    customerId: args.customerId,
    itemId: args.itemId,
    itemName: `${args.pkg.name} (${args.pkg.sku})`,
    unitPriceCents: args.pkg.priceCents,
    buyerEmail: args.order.buyerEmail,
  });
  if (!firstInvoice.ok) {
    return await failOrder(args.order.id, `QBO first invoice failed: ${firstInvoice.error}`, firstInvoice.status);
  }

  const recurringRes = await createRecurringInvoice({
    name: `${args.pkg.name} — ${args.order.buyerEmail}`,
    customerId: args.customerId,
    itemId: args.itemId,
    itemName: `${args.pkg.name} (${args.pkg.sku})`,
    unitPriceCents: args.pkg.priceCents,
    buyerEmail: args.order.buyerEmail,
    intervalType: args.cycle.intervalType,
    numInterval: args.cycle.numInterval,
  });
  if (!recurringRes.ok) {
    // First invoice exists; recurring template doesn't. Mark order
    // payment_pending and log — ops can manually create the recurring
    // template from QBO.
    await prisma.order.update({
      where: { id: args.order.id },
      data: {
        qboCustomerId: args.customerId,
        qboInvoiceId: firstInvoice.data.Id,
        qboInvoiceDocNumber: firstInvoice.data.DocNumber ?? null,
        status: "payment_pending",
        failureReason: `RecurringTransaction creation failed: ${recurringRes.error}`,
      },
    });
    await sendInvoice(firstInvoice.data.Id, args.order.buyerEmail);
    return {
      ok: true,
      order: { id: args.order.id, status: "payment_pending", qboInvoiceId: firstInvoice.data.Id },
      message: "Initial invoice issued. Recurring template failed — needs manual setup in QBO.",
    };
  }

  await prisma.order.update({
    where: { id: args.order.id },
    data: {
      qboCustomerId: args.customerId,
      qboInvoiceId: firstInvoice.data.Id,
      qboInvoiceDocNumber: firstInvoice.data.DocNumber ?? null,
      status: "payment_pending",
      metadataJson: {
        ...(args.order.metadataJson as Record<string, unknown> | null ?? {}),
        qboRecurringTransactionId: recurringRes.data.Id,
      },
    },
  });
  await sendInvoice(firstInvoice.data.Id, args.order.buyerEmail);
  await writeAuditLog({
    eventType: "checkout.subscription_created",
    eventCategory: "system",
    severity: "info",
    action: `Created subscription + first invoice for ${args.order.buyerEmail} (${args.pkg.sku})`,
    resourceType: "Order",
    resourceId: args.order.id,
    metadata: {
      qboInvoiceId: firstInvoice.data.Id,
      qboRecurringTransactionId: recurringRes.data.Id,
      packageSku: args.pkg.sku,
      cycle: args.pkg.billingCycle,
    },
  });
  return {
    ok: true,
    order: { id: args.order.id, status: "payment_pending", qboInvoiceId: firstInvoice.data.Id },
    message: "First invoice emailed. Subscription template active for renewals.",
  };
}

async function failOrder(orderId: string, reason: string, upstreamStatus: number): Promise<CheckoutResult> {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "failed", failedAt: new Date(), failureReason: reason },
  });
  await writeAuditLog({
    eventType: "checkout.failed",
    eventCategory: "system",
    severity: "warning",
    action: reason,
    resourceType: "Order",
    resourceId: orderId,
    metadata: { upstreamStatus },
  });
  return { ok: false, status: 502, error: reason };
}
