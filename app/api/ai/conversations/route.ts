import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { getAiConfig } from "@/lib/ai/config";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId") ?? "";
  try {
    await resolveAiAuthority(organizationId, "ai.access");
    return NextResponse.json({ ok: true, conversations: [], contentStorageEnabled: getAiConfig().storeConversationContent });
  } catch { return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 }); }
}
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { organizationId?: unknown } | null;
  if (!body || typeof body.organizationId !== "string") return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  try {
    await resolveAiAuthority(body.organizationId, "ai.chat");
    return NextResponse.json({ ok: true, conversation: { id: randomUUID(), contentStored: false } }, { status: 201 });
  } catch { return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 }); }
}
