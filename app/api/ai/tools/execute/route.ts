import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveAiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { writeAiAudit } from "@/lib/ai/audit/ai-audit-service";
import { AiClassificationSchema } from "@/lib/ai/schemas/chat";
import { executeAiTool, ToolPolicyError } from "@/lib/ai/tools/tool-executor";
import { getToolDefinition } from "@/lib/ai/tools/tool-registry";

const Schema = z.object({ organizationId: z.string().min(1), toolName: z.string().min(1).max(120), arguments: z.record(z.string(), z.unknown()), classification: AiClassificationSchema }).strict();

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  const definition = getToolDefinition(parsed.data.toolName);
  if (!definition) return NextResponse.json({ ok: false, error: "unknown_tool" }, { status: 404 });
  try {
    const authority = await resolveAiAuthority(parsed.data.organizationId, definition.requiredPermission);
    const requestId = randomUUID();
    const result = await executeAiTool({ ...parsed.data, authority, cookieHeader: request.headers.get("cookie") ?? "", requestId });
    await writeAiAudit({ authority, eventType: result.status === "APPROVAL_REQUIRED" ? "ai.approval.created" : "ai.tool.executed", action: `${result.toolName}: ${result.status}`, requestId, classification: parsed.data.classification, outcome: "completed", toolCallsRequested: [result.toolName], toolCallsExecuted: result.status === "SUCCEEDED" ? [result.toolName] : [], approvalRequired: result.status === "APPROVAL_REQUIRED", approvalId: result.approvalId });
    return NextResponse.json({ ok: true, requestId, result });
  } catch (error) {
    if (error instanceof ToolPolicyError) return NextResponse.json({ ok: false, error: error.code, message: error.message }, { status: 422 });
    return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 });
  }
}
