import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveAiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { writeAiAudit } from "@/lib/ai/audit/ai-audit-service";
import { evaluateClassification } from "@/lib/ai/classification/classification-policy";
import { getAiConfig } from "@/lib/ai/config";
import { createDevelopmentCorpus, DeterministicRetrievalAdapter } from "@/lib/ai/retrieval/retrieval-service";
import { AiClassificationSchema } from "@/lib/ai/schemas/chat";

const Schema = z.object({ organizationId: z.string().min(1), query: z.string().min(1).max(4000), classification: AiClassificationSchema }).strict();

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  try {
    const authority = await resolveAiAuthority(parsed.data.organizationId, "ai.retrieve");
    const config = getAiConfig();
    const decision = evaluateClassification({ classification: parsed.data.classification, aiEnabled: config.enabled, externalInference: config.externalInferenceEnabled, allowedClassifications: config.allowedClassifications });
    if (!decision.allowed) return NextResponse.json({ ok: false, error: decision.code, message: decision.reason }, { status: 422 });
    const requestId = randomUUID();
    const results = await new DeterministicRetrievalAdapter(createDevelopmentCorpus(authority.canonicalOrganizationId)).search({ query: parsed.data.query, canonicalOrganizationId: authority.canonicalOrganizationId, allowedClassifications: config.allowedClassifications, roles: authority.roles, permissions: authority.permissions, limit: config.maxRetrievalChunks });
    await writeAiAudit({ authority, eventType: "ai.retrieval.performed", action: `Retrieved ${results.length} authorized source(s)`, requestId, classification: parsed.data.classification, outcome: "completed", retrievalUsed: true });
    return NextResponse.json({ ok: true, requestId, results });
  } catch { return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 }); }
}
