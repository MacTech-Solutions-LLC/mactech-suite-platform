"use server";

import { createHmac, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  createWebhookSchema,
  type CreateWebhookInput,
} from "@/lib/validations/webhook";
import type {
  Prisma,
  WebhookSubscription,
  WebhookSubscriptionStatus,
} from "@prisma/client";

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export async function createWebhook(rawInput: CreateWebhookInput) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);
  const input = createWebhookSchema.parse(rawInput);

  const secret = generateSecret();

  const sub = await prisma.webhookSubscription.create({
    data: {
      name: input.name,
      url: input.url,
      events: input.events,
      customerOrganizationId: input.customerOrganizationId || null,
      appKey: input.appKey || null,
      secret,
      createdById: ctx.userProfile.id,
      status: "active",
    },
  });

  await writeAuditLog({
    eventType: "webhook.subscription.created",
    eventCategory: "system",
    severity: "info",
    action: `Created webhook subscription '${sub.name}' → ${input.url}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: sub.customerOrganizationId,
    resourceType: "WebhookSubscription",
    resourceId: sub.id,
    metadata: {
      url: input.url,
      events: input.events,
      appKey: input.appKey,
    },
  });

  return { ...sub, secret };
}

export async function updateWebhookStatus(
  id: string,
  status: WebhookSubscriptionStatus,
) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);
  const sub = await prisma.webhookSubscription.update({
    where: { id },
    data: { status },
  });
  await writeAuditLog({
    eventType: `webhook.subscription.${status}`,
    eventCategory: "system",
    severity: status === "active" ? "info" : "warning",
    action: `Set webhook subscription '${sub.name}' status to ${status}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: sub.customerOrganizationId,
    resourceType: "WebhookSubscription",
    resourceId: sub.id,
    metadata: { url: sub.url },
  });
  return sub;
}

export async function deleteWebhook(id: string) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);
  const sub = await prisma.webhookSubscription.delete({ where: { id } });
  await writeAuditLog({
    eventType: "webhook.subscription.deleted",
    eventCategory: "system",
    severity: "warning",
    action: `Deleted webhook subscription '${sub.name}'`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: sub.customerOrganizationId,
    resourceType: "WebhookSubscription",
    resourceId: sub.id,
    metadata: { url: sub.url },
  });
  return sub;
}

export interface DispatchEventInput {
  eventType: string;
  eventId: string; // typically AuditLog.id
  customerOrganizationId?: string | null;
  payload: Record<string, unknown>;
}

/**
 * Find every active subscription for `eventType` (matched by exact name
 * OR by prefix wildcard like `entitlement.*`) and queue a delivery for
 * each. Org-scoped subscriptions only fire when the event's org matches.
 *
 * Best-effort + fire-and-forget: errors are swallowed so a webhook
 * outage cannot block the original mutation.
 */
export async function dispatchWebhookEvent(input: DispatchEventInput): Promise<void> {
  try {
    const subs = await prisma.webhookSubscription.findMany({
      where: {
        status: "active",
        OR: [
          { customerOrganizationId: null },
          { customerOrganizationId: input.customerOrganizationId ?? undefined },
        ],
      },
    });

    const matching = subs.filter((s) => subscriptionMatches(s.events, input.eventType));
    if (matching.length === 0) return;

    await Promise.all(
      matching.map((sub) =>
        deliverWithRetry(sub, input).catch((err) => {
          console.error(`[webhook] delivery to ${sub.url} crashed:`, err);
        }),
      ),
    );
  } catch (err) {
    console.error("[webhook] dispatch failed:", err);
  }
}

function subscriptionMatches(subscribedEvents: string[], eventType: string): boolean {
  return subscribedEvents.some((subscribed) => {
    if (subscribed === "*") return true;
    if (subscribed === eventType) return true;
    if (subscribed.endsWith(".*")) {
      const prefix = subscribed.slice(0, -2);
      return eventType.startsWith(`${prefix}.`);
    }
    return false;
  });
}

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [0, 30_000, 120_000, 600_000, 3_600_000]; // 0s, 30s, 2m, 10m, 1h

async function deliverWithRetry(
  sub: WebhookSubscription,
  input: DispatchEventInput,
): Promise<void> {
  const body = JSON.stringify({
    eventType: input.eventType,
    eventId: input.eventId,
    timestamp: new Date().toISOString(),
    customerOrgId: input.customerOrganizationId ?? null,
    payload: input.payload,
  });
  const signature = createHmac("sha256", sub.secret).update(body).digest("hex");

  const delivery = await prisma.webhookDelivery.create({
    data: {
      subscriptionId: sub.id,
      eventId: input.eventId,
      eventType: input.eventType,
      status: "pending",
      payloadJson: input.payload as Prisma.InputJsonValue,
    },
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(sub.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "MacTechIdentity/1.0 webhook",
          "X-MacTech-Webhook-Signature": signature,
          "X-MacTech-Webhook-Event": input.eventType,
          "X-MacTech-Webhook-Delivery": delivery.id,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text().catch(() => "");
      if (res.ok) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "delivered",
            attemptCount: attempt,
            responseStatus: res.status,
            responseBodyHead: text.slice(0, 512),
            deliveredAt: new Date(),
          },
        });
        await prisma.webhookSubscription.update({
          where: { id: sub.id },
          data: { lastSuccessAt: new Date(), failureCount: 0 },
        });
        return;
      }
      // Non-2xx → record + maybe retry
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: attempt < MAX_ATTEMPTS ? "pending" : "abandoned",
          attemptCount: attempt,
          responseStatus: res.status,
          responseBodyHead: text.slice(0, 512),
          errorMessage: `HTTP ${res.status}`,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: attempt < MAX_ATTEMPTS ? "pending" : "abandoned",
          attemptCount: attempt,
          errorMessage: msg.slice(0, 512),
        },
      });
    }
    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAYS_MS[attempt] ?? 60_000);
    }
  }

  // Reached MAX_ATTEMPTS — mark sub as failure-prone and the delivery as failed.
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: "abandoned" },
  });
  await prisma.webhookSubscription.update({
    where: { id: sub.id },
    data: {
      lastFailureAt: new Date(),
      failureCount: { increment: 1 },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sprint 26: operator-triggered single-attempt retry of a stale
 * delivery. Updates the existing WebhookDelivery row in place
 * (attemptCount++, status, response columns) rather than creating a
 * new row — operator sees the same receipt, just with a fresh outcome.
 *
 * Bypasses MAX_ATTEMPTS — the cap exists for the auto-retry loop, but
 * a manual click is an explicit "I think the upstream is back, try
 * once". If it fails again we just record the failure and surface it.
 */
export async function retryWebhookDelivery(
  deliveryId: string,
): Promise<
  | { ok: true; status: "delivered" | "abandoned"; httpStatus: number | null }
  | { ok: false; reason: "not_found" | "already_delivered" | "subscription_inactive" }
> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { subscription: true },
  });
  if (!delivery) return { ok: false, reason: "not_found" };
  if (delivery.status === "delivered")
    return { ok: false, reason: "already_delivered" };
  if (delivery.subscription.status !== "active")
    return { ok: false, reason: "subscription_inactive" };

  const sub = delivery.subscription;
  const body = JSON.stringify({
    eventType: delivery.eventType,
    eventId: delivery.eventId,
    timestamp: new Date().toISOString(),
    customerOrgId: sub.customerOrganizationId ?? null,
    payload: delivery.payloadJson,
    retryOf: delivery.id,
  });
  const signature = createHmac("sha256", sub.secret).update(body).digest("hex");
  const nextAttempt = delivery.attemptCount + 1;

  let outcome: "delivered" | "abandoned" = "abandoned";
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  let responseBodyHead: string | null = null;

  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MacTechIdentity/1.0 webhook-retry",
        "X-MacTech-Webhook-Signature": signature,
        "X-MacTech-Webhook-Event": delivery.eventType,
        "X-MacTech-Webhook-Delivery": delivery.id,
        "X-MacTech-Webhook-Manual-Retry": "true",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    httpStatus = res.status;
    responseBodyHead = (await res.text().catch(() => "")).slice(0, 512);
    outcome = res.ok ? "delivered" : "abandoned";
    if (!res.ok) errorMessage = `HTTP ${res.status}`;
  } catch (err) {
    errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 512);
  }

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: outcome,
      attemptCount: nextAttempt,
      responseStatus: httpStatus,
      responseBodyHead,
      errorMessage,
      deliveredAt: outcome === "delivered" ? new Date() : null,
    },
  });

  // Best-effort: keep the subscription's failure tracking honest.
  await prisma.webhookSubscription.update({
    where: { id: sub.id },
    data:
      outcome === "delivered"
        ? { lastSuccessAt: new Date(), failureCount: 0 }
        : { lastFailureAt: new Date(), failureCount: { increment: 1 } },
  });

  await writeAuditLog({
    eventType: `webhook.delivery.manual_retry.${outcome}`,
    eventCategory: "system",
    severity: outcome === "delivered" ? "info" : "warning",
    action: `Manually retried webhook delivery ${delivery.id} → ${outcome} (HTTP ${httpStatus ?? "n/a"})`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: sub.customerOrganizationId,
    resourceType: "WebhookDelivery",
    resourceId: delivery.id,
    metadata: {
      subscriptionId: sub.id,
      url: sub.url,
      eventType: delivery.eventType,
      previousAttempts: delivery.attemptCount,
      newAttempt: nextAttempt,
      httpStatus,
      errorMessage,
    },
  });

  revalidatePath("/admin/webhooks");
  return { ok: true, status: outcome, httpStatus };
}
