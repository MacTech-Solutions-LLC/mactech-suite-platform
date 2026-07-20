import { NextResponse, type NextRequest } from "next/server";
import { AuthorizationError } from "@/lib/authz";
import { resolveAiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { AiServiceError, streamAiTurn } from "@/lib/ai/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = body && typeof body === "object" && typeof (body as { organizationId?: unknown }).organizationId === "string"
    ? (body as { organizationId: string }).organizationId
    : "";
  try {
    const authority = await resolveAiAuthority(organizationId, "ai.chat");
    const iterator = streamAiTurn({ rawRequest: body, authority, cookieHeader: request.headers.get("cookie") ?? "", abortSignal: request.signal });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of iterator) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch (error) {
          const payload = errorPayload(error);
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", ...payload })}\n`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    const payload = errorPayload(error);
    return NextResponse.json({ ok: false, ...payload }, { status: payload.status });
  }
}
function errorPayload(error: unknown): { error: string; message: string; status: number } {
  if (error instanceof AiServiceError) return { error: error.code, message: error.message, status: error.status };
  if (error instanceof AuthorizationError) return { error: error.code, message: error.message, status: error.code === "unauthenticated" ? 401 : 403 };
  return { error: "ai_request_failed", message: "The AI request failed safely.", status: 500 };
}
