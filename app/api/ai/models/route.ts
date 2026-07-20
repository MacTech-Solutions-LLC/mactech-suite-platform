import { NextResponse, type NextRequest } from "next/server";
import { resolveAiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { createProvider } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId") ?? "";
  try {
    await resolveAiAuthority(organizationId, "ai.access");
    const models = await createProvider().listModels(request.signal);
    return NextResponse.json({ ok: true, models });
  } catch { return NextResponse.json({ ok: false, error: "access_or_provider_unavailable" }, { status: 403 }); }
}
