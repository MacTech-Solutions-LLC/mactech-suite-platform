/**
 * Public checkout API for the marketing site.
 *
 * POST body:
 *   {
 *     "packageSku": "starter-monthly",
 *     "buyerEmail": "buyer@example.com",
 *     "buyerName":  "Jane Buyer",          // optional
 *     "buyerCompany": "Acme Corp",         // optional
 *     "idempotencyKey": "uuid-v4"          // optional, recommended
 *   }
 *
 * Required header:
 *   X-Mactech-Signature: sha256=<hex>
 *   where hex = hmac-sha256(MARKETING_SITE_HMAC_SECRET, raw request body)
 *
 * Responses:
 *   200 { ok: true, order: { id, status, qboInvoiceId }, message }
 *   400 invalid input
 *   401 signature missing/invalid
 *   404 unknown packageSku
 *   503 service not configured (MARKETING_SITE_HMAC_SECRET or QBO not set up)
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env, marketingSiteHmacConfigured } from "@/lib/env";
import { verifyMarketingSignature } from "@/lib/integrations/quickbooks/marketing-signature";
import { createCheckoutSession } from "@/lib/services/checkout-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CheckoutBodySchema = z.object({
  packageSku: z.string().min(1).max(60),
  buyerEmail: z.string().email().max(254),
  buyerName: z.string().max(200).optional().nullable(),
  buyerCompany: z.string().max(200).optional().nullable(),
  idempotencyKey: z.string().max(128).optional().nullable(),
});

export async function POST(request: NextRequest) {
  if (!marketingSiteHmacConfigured()) {
    return NextResponse.json(
      { error: "MARKETING_SITE_HMAC_SECRET is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-mactech-signature");
  const verdict = verifyMarketingSignature(rawBody, signature, env.MARKETING_SITE_HMAC_SECRET);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: `Signature ${verdict.reason}` },
      { status: 401 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const body = CheckoutBodySchema.safeParse(parsed);
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const result = await createCheckoutSession(body.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
