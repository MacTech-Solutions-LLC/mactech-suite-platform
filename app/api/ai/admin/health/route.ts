import { NextResponse, type NextRequest } from "next/server";
import { resolveAiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { getAiConfig } from "@/lib/ai/config";
import { createProvider } from "@/lib/ai/service";
import { createDevelopmentCorpus, DeterministicRetrievalAdapter } from "@/lib/ai/retrieval/retrieval-service";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/tool-registry";
import type { ProviderHealth } from "@/lib/ai/providers/provider";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId") ?? "";
  try {
    await resolveAiAuthority(organizationId, "ai.admin");
    const config = getAiConfig();
    let providerHealth: ProviderHealth = { ok: false, provider: config.provider, detail: "Provider disabled", checkedAt: new Date().toISOString() };
    try { providerHealth = await createProvider(config).healthCheck(request.signal); } catch (error) { providerHealth.detail = error instanceof Error ? error.message : "Provider unavailable"; }
    const retrieval = await new DeterministicRetrievalAdapter(createDevelopmentCorpus(organizationId)).health();
    return NextResponse.json({
      ok: true,
      configuration: {
        aiEnabled: config.enabled,
        provider: config.provider,
        configuredModel: config.defaultModel ?? null,
        externalInferenceEnabled: config.externalInferenceEnabled,
        developmentMode: config.developmentMode,
        allowedClassifications: config.allowedClassifications,
        conversationContentStored: config.storeConversationContent,
        auditRetentionDays: config.auditRetentionDays,
        apiKeyConfigured: Boolean(config.nvidiaApiKey),
      },
      providerHealth,
      retrieval,
      toolRegistry: { ok: true, count: Object.keys(AI_TOOL_REGISTRY).length },
    });
  } catch { return NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 }); }
}
