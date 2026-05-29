/**
 * QuickBooks Online webhook receiver.
 *
 * Phase 1: store-then-acknowledge. We verify the signature, persist the
 * raw payload to QuickbooksWebhookEvent, and 200 back to Intuit. Phase 2
 * adds the dispatcher that walks unprocessed events and provisions
 * Clerk orgs on payment.completed.
 *
 * This split keeps webhook delivery deterministic — Intuit's retry window
 * is short, and any handler work we do inline risks losing the payload
 * to a transient failure. The append-only event log is the source of
 * truth.
 */

import { NextResponse, type NextRequest } from "next/server";
import { env, quickbooksWebhookConfigured } from "@/lib/env";
import { prisma } from "@/lib/db/prisma";
import {
  summarizeWebhookPayload,
  verifyQuickbooksSignature,
  type QboWebhookPayload,
} from "@/lib/integrations/quickbooks/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!quickbooksWebhookConfigured()) {
    return NextResponse.json(
      { error: "QBO_WEBHOOK_VERIFIER_TOKEN is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("intuit-signature");

  const verdict = verifyQuickbooksSignature(
    rawBody,
    signature,
    env.QBO_WEBHOOK_VERIFIER_TOKEN,
  );

  if (!verdict.ok) {
    // Persist the failed delivery for audit. We never trust the payload
    // contents on a verification failure, so realmId/eventType stay null.
    await prisma.quickbooksWebhookEvent.create({
      data: {
        signatureVerified: false,
        status: "failed",
        errorMessage: `signature ${verdict.reason}`,
        payloadJson: safeParseJson(rawBody) ?? {},
        rawBody,
      },
    });
    return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
  }

  const payload = (safeParseJson(rawBody) ?? {}) as QboWebhookPayload;
  const { realmId, eventType } = summarizeWebhookPayload(payload);

  await prisma.quickbooksWebhookEvent.create({
    data: {
      signatureVerified: true,
      status: "received",
      realmId,
      eventType,
      payloadJson: payload as object,
      rawBody,
    },
  });

  return NextResponse.json({ ok: true });
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
