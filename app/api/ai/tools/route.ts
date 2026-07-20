import { NextResponse, type NextRequest } from "next/server";
import { resolveAiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/tool-registry";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId") ?? "";
  try {
    const authority = await resolveAiAuthority(organizationId, "ai.access");
    const tools = Object.values(AI_TOOL_REGISTRY)
      .filter((tool) => authority.permissions.includes(tool.requiredPermission))
      .map(({ inputSchema: _schema, ...tool }) => tool);
    return NextResponse.json({ ok: true, tools });
  } catch { return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 }); }
}
