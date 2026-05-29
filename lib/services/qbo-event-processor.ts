/**
 * Walks unprocessed QuickbooksWebhookEvent rows and dispatches each one
 * to the right handler. Today's only handler matters: Payment events
 * that match an Order's qboInvoiceId → mark Order paid → fire
 * provisioning.
 *
 * Two entry points:
 *   - processOnePayload(payload) — fired inline from the webhook receiver
 *     so the happy path completes within Intuit's delivery window
 *   - processPendingEvents() — sweep job for the cron/admin trigger,
 *     handles retries on events that failed inline
 *
 * Both share runHandler(event) so behavior is identical. We always
 * persist the outcome onto the QuickbooksWebhookEvent row (status,
 * errorMessage, processedAt) so the admin log is the source of truth.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { qboFetch } from "@/lib/integrations/quickbooks/client";
import { provisionOrder } from "./provisioning-service";
import type { QuickbooksWebhookEvent } from "@prisma/client";

type EntityChange = {
  name?: string;
  id?: string;
  operation?: string;
  lastUpdated?: string;
};

type EventNotification = {
  realmId?: string;
  dataChangeEvent?: { entities?: EntityChange[] };
};

type Payload = { eventNotifications?: EventNotification[] };

export async function processPendingEvents(limit = 50): Promise<{
  processed: number;
  failed: number;
  skipped: number;
}> {
  const pending = await prisma.quickbooksWebhookEvent.findMany({
    where: { status: { in: ["received", "failed"] }, signatureVerified: true },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  for (const event of pending) {
    const outcome = await runHandler(event);
    if (outcome === "processed") processed++;
    else if (outcome === "failed") failed++;
    else skipped++;
  }
  return { processed, failed, skipped };
}

/** Called inline from POST /api/webhooks/quickbooks immediately after
 *  persisting the event row. Best-effort — failures stay in the log
 *  for the sweep job to retry. */
export async function processEventById(eventId: string): Promise<void> {
  const event = await prisma.quickbooksWebhookEvent.findUnique({
    where: { id: eventId },
  });
  if (!event || !event.signatureVerified) return;
  await runHandler(event);
}

async function runHandler(
  event: QuickbooksWebhookEvent,
): Promise<"processed" | "failed" | "skipped"> {
  await prisma.quickbooksWebhookEvent.update({
    where: { id: event.id },
    data: { status: "processing" },
  });

  const payload = event.payloadJson as Payload;
  const entities = payload.eventNotifications?.flatMap((n) => n.dataChangeEvent?.entities ?? []) ?? [];

  if (entities.length === 0) {
    return await markSkipped(event.id, "no entities in payload");
  }

  try {
    for (const entity of entities) {
      if (entity.name === "Payment") {
        await handlePaymentChange(entity);
      }
      // Invoice / Customer events are stored for audit but don't drive
      // provisioning yet — that's Phase 3 (sync invoice metadata back).
    }
    await prisma.quickbooksWebhookEvent.update({
      where: { id: event.id },
      data: { status: "processed", processedAt: new Date(), errorMessage: null },
    });
    return "processed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await prisma.quickbooksWebhookEvent.update({
      where: { id: event.id },
      data: { status: "failed", processedAt: new Date(), errorMessage: message },
    });
    return "failed";
  }
}

async function markSkipped(eventId: string, reason: string): Promise<"skipped"> {
  await prisma.quickbooksWebhookEvent.update({
    where: { id: eventId },
    data: { status: "skipped", processedAt: new Date(), errorMessage: reason },
  });
  return "skipped";
}

type QboPaymentResource = {
  Payment: {
    Id: string;
    TotalAmt: number;
    TxnDate?: string;
    Line?: Array<{
      Amount: number;
      LinkedTxn?: Array<{ TxnId: string; TxnType: string }>;
    }>;
  };
};

async function handlePaymentChange(entity: EntityChange): Promise<void> {
  if (!entity.id) return;

  // 1. Pull the full Payment from QBO (the webhook only tells us "Payment.X
  //    changed", not the linked invoice / amount).
  const paymentRes = await qboFetch<QboPaymentResource>({
    path: `/payment/${entity.id}`,
  });
  if (!paymentRes.ok) {
    throw new Error(`fetch Payment ${entity.id}: ${paymentRes.error}`);
  }
  const payment = paymentRes.data.Payment;

  // 2. Walk linked transactions to find the invoice this payment applied to.
  const linkedInvoiceId = payment.Line?.flatMap((l) => l.LinkedTxn ?? [])
    .find((t) => t.TxnType === "Invoice")?.TxnId;
  if (!linkedInvoiceId) return; // payment isn't tied to an invoice we own

  // 3. Match to an Order.
  const order = await prisma.order.findUnique({
    where: { qboInvoiceId: linkedInvoiceId },
    include: { package: true },
  });
  if (!order) return; // payment from outside the commerce flow

  // 4. Idempotent Payment row insert (qboPaymentId is unique).
  const totalCents = Math.round(payment.TotalAmt * 100);
  const captured = payment.TxnDate ? new Date(payment.TxnDate) : new Date();
  const paymentRow = await prisma.payment.upsert({
    where: { qboPaymentId: payment.Id },
    create: {
      orderId: order.id,
      qboPaymentId: payment.Id,
      amountCents: totalCents,
      currency: order.currency,
      status: "succeeded",
      capturedAt: captured,
    },
    update: {
      amountCents: totalCents,
      status: "succeeded",
      capturedAt: captured,
    },
  });

  // 5. Mark Order paid if not already, then fire provisioning.
  if (order.status !== "provisioned" && order.status !== "paid") {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "paid", paidAt: captured },
    });
    await writeAuditLog({
      eventType: "order.paid",
      eventCategory: "system",
      severity: "info",
      action: `Payment ${payment.Id} captured for order ${order.id}`,
      resourceType: "Order",
      resourceId: order.id,
      metadata: {
        qboPaymentId: payment.Id,
        qboInvoiceId: linkedInvoiceId,
        amountCents: totalCents,
        paymentId: paymentRow.id,
      },
    });
  }

  // 6. Provision (idempotent — bails if already provisioned).
  const provisionRes = await provisionOrder(order.id);
  if (!provisionRes.ok) {
    // Provisioning failure shouldn't fail the webhook handler — the Order
    // is paid, an operator just needs to re-trigger provisioning. The
    // failure is already audit-logged inside provisionOrder.
    throw new Error(`provision order ${order.id}: ${provisionRes.error}`);
  }
}
