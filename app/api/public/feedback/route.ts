/**
 * Public feedback-ingest endpoint for the UI-Fix Chrome extension.
 *
 * The extension (see ~/ui-fix) lets a teammate pin any element on any
 * MacTech surface and file a note. Its background service worker POSTs the
 * payload here. Because the caller is a browser extension — not an
 * authenticated same-origin session — this route is public at the Clerk
 * middleware layer (matched by `/api/public/(.*)` in middleware.ts) and
 * self-authenticates with a shared bearer secret instead of a cookie.
 *
 * Auth:
 *   Authorization: Bearer <FEEDBACK_INGEST_SECRET>
 *   (timing-safe compare; distributed to the ~8 teammates who run the
 *   extension, set in each one's extension Options page).
 *
 * Body (mirrors ui-fix/content/picker.js buildPayload() + submittedBy):
 *   {
 *     content: string,                     // required, the note
 *     category: "bug"|"ux"|"feature"|"general",
 *     pageUrl: string,                     // required
 *     elementSelector?, elementId?, elementClass?,
 *     elementText?, elementType?,          // pinned-element descriptor
 *     submittedBy?: string                 // optional self-identification
 *   }
 *
 * Responses:
 *   201 { ok: true, id }
 *   400 { ok: false, error }               // bad json / invalid input
 *   401 { ok: false, error: "unauthorized" }
 *   503 { ok: false, error: "not_configured" }  // secret unset
 *
 * CORS: permissive (Access-Control-Allow-Origin: *). The extension holds
 * a host permission for this origin so its fetch is not actually subject
 * to CORS, but we answer the preflight anyway so it works from any caller.
 */

import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env, feedbackIngestConfigured } from "@/lib/env";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

const FeedbackBodySchema = z.object({
  content: z.string().trim().min(1).max(5000),
  category: z.enum(["bug", "ux", "feature", "general"]).default("general"),
  pageUrl: z.string().trim().min(1).max(2048),
  elementSelector: z.string().max(2048).optional().nullable(),
  elementId: z.string().max(256).optional().nullable(),
  elementClass: z.string().max(2048).optional().nullable(),
  elementText: z.string().max(4000).optional().nullable(),
  elementType: z.string().max(64).optional().nullable(),
  submittedBy: z.string().max(200).optional().nullable(),
});

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

/** Constant-time bearer-token check. Returns false on any shape mismatch. */
function bearerMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  if (!feedbackIngestConfigured()) {
    return json({ ok: false, error: "not_configured" }, 503);
  }
  if (!bearerMatches(request.headers.get("authorization"), env.FEEDBACK_INGEST_SECRET!)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const parsed = FeedbackBodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" },
      400,
    );
  }
  const data = parsed.data;

  const created = await prisma.feedback.create({
    data: {
      content: data.content,
      category: data.category,
      pageUrl: data.pageUrl,
      elementSelector: data.elementSelector ?? null,
      elementId: data.elementId ?? null,
      elementClass: data.elementClass ?? null,
      elementText: data.elementText ?? null,
      elementType: data.elementType ?? null,
      submittedBy: data.submittedBy?.trim() || null,
      userAgent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
    },
    select: { id: true },
  });

  return json({ ok: true, id: created.id }, 201);
}
