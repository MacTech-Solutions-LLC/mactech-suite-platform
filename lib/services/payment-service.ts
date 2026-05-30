"use server";

/**
 * In-suite "Receive Payment" — mirrors QuickBooks' Receive Payment screen
 * from inside MacTech Suite. Two paths, one settlement core:
 *
 *   recordManualPayment — operator logs a check/cash/ACH/other payment they
 *     received out-of-band. We write an accounting Payment in QBO (closing
 *     the invoice) and mark the order paid.
 *
 *   chargeOrderPayment — operator charges a card or bank account live via
 *     the QuickBooks Payments API (token minted in the browser), then we
 *     write the accounting Payment to settle the invoice in the books.
 *
 * Both converge on settleOrder(): upsert a local Payment, flip the Order to
 * paid, write an audit row, and fire provisioning. The local Payment is
 * keyed on the accounting Payment's QBO id — the SAME id the QBO webhook
 * will echo back — so when Intuit notifies us of the payment we created,
 * the upsert is a no-op and provisioning never double-runs.
 *
 * Gated by ORDERS_MANAGE. Idempotent: an already-paid order short-circuits.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { quickbooksOauthConfigured } from "@/lib/env";
import { createPayment, getInvoice } from "@/lib/integrations/quickbooks/client";
import { chargeCard, chargeEcheck } from "@/lib/integrations/quickbooks/payments-client";
import { connectionHasPaymentsScope } from "@/lib/integrations/quickbooks/connection-service";
import { provisionOrder } from "./provisioning-service";
import type { Order, OrderStatus, Package } from "@prisma/client";
import type { CommandCenterAuthContext } from "@/lib/authz";

export type OrderPaymentContext =
  | {
      ok: true;
      orderId: string;
      buyerEmail: string;
      docNumber: string | null;
      totalCents: number;
      openBalanceCents: number;
      currency: string;
      status: OrderStatus;
      alreadyPaid: boolean;
      hasInvoice: boolean;
      /** OAuth configured AND payments scope granted → charging is available. */
      paymentsAvailable: boolean;
      /** OAuth configured at all (connect exists) → manual recording works. */
      paymentsConfigured: boolean;
    }
  | { ok: false; error: string };

export type ReceivePaymentResult =
  | { ok: true; status: OrderStatus; provisioned: boolean; warning?: string }
  | { ok: false; error: string; declined?: boolean; needsReconnect?: boolean };

const manualSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
  method: z.enum(["check", "cash", "ach", "other"]),
  referenceNo: z.string().max(60).optional().nullable(),
  /** YYYY-MM-DD from the date picker; defaults to today. */
  txnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

const chargeSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
  type: z.enum(["card", "echeck"]),
  /** Opaque single-use token minted client-side against Intuit's tokens API. */
  token: z.string().min(8).max(512),
  /** Masked instrument hints for display/audit only — never the full PAN. */
  last4: z.string().max(4).optional().nullable(),
  brand: z.string().max(40).optional().nullable(),
});

export type RecordManualPaymentInput = z.infer<typeof manualSchema>;
export type ChargeOrderPaymentInput = z.infer<typeof chargeSchema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Load the order and reject states/configs that can't take a payment. */
async function loadChargeableOrder(
  orderId: string,
): Promise<
  | { ok: true; order: Order & { package: Package } }
  | { ok: false; result: ReceivePaymentResult }
> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { package: true },
  });
  if (!order) return { ok: false, result: { ok: false, error: "Order not found." } };
  if (order.status === "cancelled" || order.status === "refunded") {
    return { ok: false, result: { ok: false, error: `Order is ${order.status}.` } };
  }
  if (!order.qboInvoiceId || !order.qboCustomerId) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "This order has no QuickBooks invoice yet — it can't take a payment.",
      },
    };
  }
  return { ok: true, order };
}

/**
 * The shared settlement core. Records the QBO accounting Payment locally,
 * flips the order to paid, audits, and provisions. Idempotent on
 * qboPaymentId (matches the webhook path).
 */
async function settleOrder(args: {
  order: Order & { package: Package };
  qboPaymentId: string | null;
  amountCents: number;
  capturedAt: Date;
  source: "manual" | "card" | "echeck";
  metadata: Record<string, string | number | boolean | null>;
  ctx: CommandCenterAuthContext;
}): Promise<{ provisioned: boolean; warning?: string }> {
  const { order } = args;

  const paymentData = {
    amountCents: args.amountCents,
    currency: order.currency,
    status: "succeeded" as const,
    capturedAt: args.capturedAt,
    metadataJson: { source: args.source, ...args.metadata },
  };

  if (args.qboPaymentId) {
    await prisma.payment.upsert({
      where: { qboPaymentId: args.qboPaymentId },
      create: { orderId: order.id, qboPaymentId: args.qboPaymentId, ...paymentData },
      update: paymentData,
    });
  } else {
    // No accounting Payment id (e.g. charge captured but the books write
    // failed). Record it so the money is tracked; reconcile invoice in QBO.
    await prisma.payment.create({ data: { orderId: order.id, ...paymentData } });
  }

  if (order.status !== "paid" && order.status !== "provisioned") {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "paid", paidAt: args.capturedAt },
    });
  }

  await writeAuditLog({
    eventType: "order.payment_recorded",
    eventCategory: "system",
    severity: "info",
    action: `Recorded ${args.source} payment of ${(args.amountCents / 100).toFixed(2)} ${order.currency} for order ${order.id}`,
    actorClerkUserId: args.ctx.clerkUserId,
    actorEmail: args.ctx.userProfile.email,
    actorUserProfileId: args.ctx.userProfile.id,
    resourceType: "Order",
    resourceId: order.id,
    metadata: {
      qboPaymentId: args.qboPaymentId,
      qboInvoiceId: order.qboInvoiceId,
      amountCents: args.amountCents,
      source: args.source,
      ...args.metadata,
    },
  });

  const prov = await provisionOrder(order.id);
  if (!prov.ok) {
    return {
      provisioned: false,
      warning: `Payment recorded, but provisioning failed: ${prov.error}. Retry provisioning from the order.`,
    };
  }
  return { provisioned: true };
}

/** Loads everything the Receive Payment modal needs when it opens. */
export async function getOrderPaymentContext(orderId: string): Promise<OrderPaymentContext> {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.ORDERS_VIEW);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: { where: { status: "succeeded" }, select: { amountCents: true } } },
  });
  if (!order) return { ok: false, error: "Order not found." };

  const paidSoFar = order.payments.reduce((sum, p) => sum + p.amountCents, 0);
  let openBalanceCents = Math.max(0, order.totalCents - paidSoFar);

  // Prefer the live invoice balance when we have one (handles partial
  // payments / edits made directly in QBO).
  if (order.qboInvoiceId) {
    const inv = await getInvoice(order.qboInvoiceId);
    if (inv.ok) openBalanceCents = Math.round(inv.data.Balance * 100);
  }

  const oauthConfigured = quickbooksOauthConfigured();
  const paymentsAvailable = oauthConfigured && (await connectionHasPaymentsScope());

  return {
    ok: true,
    orderId: order.id,
    buyerEmail: order.buyerEmail,
    docNumber: order.qboInvoiceDocNumber,
    totalCents: order.totalCents,
    openBalanceCents,
    currency: order.currency,
    status: order.status,
    alreadyPaid: order.status === "paid" || order.status === "provisioned",
    hasInvoice: Boolean(order.qboInvoiceId),
    paymentsConfigured: oauthConfigured,
    paymentsAvailable,
  };
}

/** Record a payment received out-of-band (check / cash / ACH / other). */
export async function recordManualPayment(
  orderId: string,
  rawInput: RecordManualPaymentInput,
): Promise<ReceivePaymentResult> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.ORDERS_MANAGE);
  const input = manualSchema.parse(rawInput);

  const loaded = await loadChargeableOrder(orderId);
  if (!loaded.ok) return loaded.result;
  const { order } = loaded;

  if (order.status === "paid" || order.status === "provisioned") {
    return { ok: true, status: order.status, provisioned: order.status === "provisioned" };
  }

  const methodLabel =
    input.method === "ach" ? "ACH bank transfer" : input.method.charAt(0).toUpperCase() + input.method.slice(1);
  const txnDate = input.txnDate ?? today();

  const paymentRes = await createPayment({
    customerId: order.qboCustomerId!,
    invoiceId: order.qboInvoiceId!,
    amountCents: input.amountCents,
    txnDate,
    paymentRefNum: input.referenceNo ?? null,
    privateNote: `${methodLabel} payment recorded via MacTech Suite${input.referenceNo ? ` (ref ${input.referenceNo})` : ""}`,
  });
  if (!paymentRes.ok) {
    return { ok: false, error: `QuickBooks rejected the payment: ${paymentRes.error}` };
  }

  const settled = await settleOrder({
    order,
    qboPaymentId: paymentRes.data.Id,
    amountCents: input.amountCents,
    capturedAt: new Date(`${txnDate}T00:00:00`),
    source: "manual",
    metadata: { method: input.method, referenceNo: input.referenceNo ?? null },
    ctx,
  });

  revalidatePath("/admin/orders");
  return { ok: true, status: "paid", provisioned: settled.provisioned, warning: settled.warning };
}

/** Charge a card or bank account live via the QuickBooks Payments API,
 *  then settle the invoice in the accounting books. */
export async function chargeOrderPayment(
  orderId: string,
  rawInput: ChargeOrderPaymentInput,
): Promise<ReceivePaymentResult> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.ORDERS_MANAGE);
  const input = chargeSchema.parse(rawInput);

  if (!(await connectionHasPaymentsScope())) {
    return {
      ok: false,
      needsReconnect: true,
      error:
        "QuickBooks is connected but not authorized for Payments. Reconnect it from Settings → QuickBooks to enable card/ACH charging.",
    };
  }

  const loaded = await loadChargeableOrder(orderId);
  if (!loaded.ok) return loaded.result;
  const { order } = loaded;

  if (order.status === "paid" || order.status === "provisioned") {
    return { ok: true, status: order.status, provisioned: order.status === "provisioned" };
  }

  // 1. Take the money via the Payments API (idempotent on Request-Id).
  const requestId = randomUUID();
  const charge =
    input.type === "echeck"
      ? await chargeEcheck({ token: input.token, amountCents: input.amountCents, requestId })
      : await chargeCard({
          token: input.token,
          amountCents: input.amountCents,
          currency: order.currency,
          requestId,
          description: `${order.package.name} — order ${order.id}`,
        });

  if (!charge.ok) {
    // Record the failed attempt for the audit trail (no money moved).
    await prisma.payment.create({
      data: {
        orderId: order.id,
        amountCents: input.amountCents,
        currency: order.currency,
        status: "failed",
        failureReason: charge.error,
        metadataJson: {
          source: input.type,
          gateway: "qbo_payments",
          declined: charge.declined ?? false,
          code: charge.code ?? null,
          last4: input.last4 ?? null,
          brand: input.brand ?? null,
        },
      },
    });
    await writeAuditLog({
      eventType: "order.charge_failed",
      eventCategory: "system",
      severity: "warning",
      action: `Charge ${charge.declined ? "declined" : "failed"} for order ${order.id}: ${charge.error}`,
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      resourceType: "Order",
      resourceId: order.id,
      metadata: { type: input.type, amountCents: input.amountCents, code: charge.code ?? null },
    });
    revalidatePath("/admin/orders");
    return { ok: false, error: charge.error, declined: charge.declined };
  }

  // 2. Settle in the accounting books so the invoice closes.
  const settlement = await createPayment({
    customerId: order.qboCustomerId!,
    invoiceId: order.qboInvoiceId!,
    amountCents: input.amountCents,
    txnDate: today(),
    paymentRefNum: charge.chargeId,
    privateNote: `${input.type === "echeck" ? "ACH" : "Card"} charge ${charge.chargeId} via MacTech Suite (QuickBooks Payments)`,
  });

  const chargeMeta = {
    gateway: "qbo_payments",
    chargeId: charge.chargeId,
    chargeStatus: charge.status,
    last4: charge.last4 ?? input.last4 ?? null,
    brand: charge.brand ?? input.brand ?? null,
  };

  if (!settlement.ok) {
    // Money was captured but the books write failed. Don't punish the
    // customer: record locally, mark paid, provision, and flag for manual
    // reconciliation of the invoice in QBO.
    const settled = await settleOrder({
      order,
      qboPaymentId: null,
      amountCents: input.amountCents,
      capturedAt: new Date(),
      source: input.type === "echeck" ? "echeck" : "card",
      metadata: { ...chargeMeta, settlementError: settlement.error },
      ctx,
    });
    revalidatePath("/admin/orders");
    return {
      ok: true,
      status: "paid",
      provisioned: settled.provisioned,
      warning: `Charge ${charge.chargeId} succeeded, but writing the payment to the QuickBooks invoice failed (${settlement.error}). The invoice may still show open — reconcile it in QuickBooks.`,
    };
  }

  const settled = await settleOrder({
    order,
    qboPaymentId: settlement.data.Id,
    amountCents: input.amountCents,
    capturedAt: new Date(),
    source: input.type === "echeck" ? "echeck" : "card",
    metadata: chargeMeta,
    ctx,
  });

  revalidatePath("/admin/orders");
  return { ok: true, status: "paid", provisioned: settled.provisioned, warning: settled.warning };
}
