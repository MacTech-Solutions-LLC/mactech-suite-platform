import { NextResponse, type NextRequest } from "next/server";
import { resolveAiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId") ?? "";
  try {
    await resolveAiAuthority(organizationId, "ai.approve");
    const approvals = await prisma.agentRun.findMany({ where: { requestText: { startsWith: "[MacTech AI approval:" } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, status: true, requestText: true, planSummary: true, requestedByEmail: true, approvedByEmail: true, createdAt: true, approvedAt: true, rejectedAt: true } });
    return NextResponse.json({ ok: true, approvals });
  } catch { return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 }); }
}
