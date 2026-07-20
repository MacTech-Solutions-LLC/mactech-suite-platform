import { randomUUID } from "crypto";
import type { AiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { scanAndRedactSecrets } from "@/lib/ai/audit/redaction";
import { writeAiAudit } from "@/lib/ai/audit/ai-audit-service";
import { evaluateClassification } from "@/lib/ai/classification/classification-policy";
import { getAiConfig } from "@/lib/ai/config";
import { MockAiProvider } from "@/lib/ai/providers/mock-provider";
import { NvidiaAiProvider } from "@/lib/ai/providers/nvidia-provider";
import type { AiProvider } from "@/lib/ai/providers/provider";
import { buildMacTechSystemPrompt } from "@/lib/ai/prompts/system-prompt";
import { createDevelopmentCorpus, DeterministicRetrievalAdapter, type RetrievalCitation } from "@/lib/ai/retrieval/retrieval-service";
import { AiChatRequestSchema, type AiChatRequest, type AiStreamEvent } from "@/lib/ai/schemas/chat";
import { executeAiTool, type ToolExecutionResult } from "@/lib/ai/tools/tool-executor";

export type AiTurnEvent =
  | { type: "meta"; requestId: string; conversationId: string; provider: string; model: string; classification: string }
  | { type: "citation"; citation: RetrievalCitation }
  | { type: "tool_result"; result: ToolExecutionResult }
  | AiStreamEvent;

export async function* streamAiTurn(input: {
  rawRequest: unknown;
  authority: AiAuthority;
  cookieHeader: string;
  abortSignal?: AbortSignal;
}): AsyncIterable<AiTurnEvent> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const parsed = AiChatRequestSchema.safeParse(input.rawRequest);
  if (!parsed.success) throw new AiServiceError("validation_failed", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "), 400);
  const request = parsed.data;
  if (request.organizationId !== input.authority.canonicalOrganizationId) throw new AiServiceError("tenant_mismatch", "The requested tenant does not match the resolved Hub authority.", 403);
  const config = getAiConfig();
  const promptText = request.messages.map((message) => message.content).join("\n");
  if (promptText.length > config.maxInputChars) throw new AiServiceError("input_too_large", `Input exceeds ${config.maxInputChars} characters.`, 413);
  const policy = evaluateClassification({
    classification: request.classification,
    aiEnabled: config.enabled,
    externalInference: config.externalInferenceEnabled,
    allowedClassifications: config.allowedClassifications,
  });
  const secretScan = scanAndRedactSecrets(promptText);
  if (!policy.allowed || secretScan.detected) {
    await writeAiAudit({
      authority: input.authority,
      eventType: secretScan.detected ? "ai.classification.blocked" : "ai.chat.blocked",
      action: secretScan.detected ? "Blocked AI request containing a secret pattern" : `Blocked AI request: ${policy.code}`,
      requestId,
      conversationId: request.conversationId,
      classification: request.classification,
      outcome: "blocked",
      prompt: promptText,
      latencyMs: Date.now() - startedAt,
    });
    throw new AiServiceError(secretScan.detected ? "secret_detected" : policy.code, secretScan.detected ? `Secret-like content detected (${secretScan.labels.join(", ")}). Remove it before using AI.` : policy.reason, 422);
  }
  const provider = createProvider(config);
  const conversationId = request.conversationId ?? randomUUID();
  const model = request.model ?? config.defaultModel ?? (config.provider === "mock" ? "mactech/mock-deterministic-v1" : "unconfigured");
  yield { type: "meta", requestId, conversationId, provider: provider.name, model, classification: request.classification };
  await writeAiAudit({
    authority: input.authority,
    eventType: "ai.chat.requested",
    action: "MacTech AI chat requested",
    requestId,
    conversationId,
    provider: provider.name,
    model,
    classification: request.classification,
    outcome: "requested",
    prompt: promptText,
    retrievalUsed: request.useRetrieval,
    toolCallsRequested: request.toolName ? [request.toolName] : [],
  });

  let retrieval = [] as Awaited<ReturnType<DeterministicRetrievalAdapter["search"]>>;
  if (request.useRetrieval) {
    if (!input.authority.permissions.includes("ai.retrieve")) throw new AiServiceError("permission_denied", "Retrieval permission is required.", 403);
    const adapter = new DeterministicRetrievalAdapter(createDevelopmentCorpus(input.authority.canonicalOrganizationId));
    retrieval = await adapter.search({
      query: request.retrievalQuery ?? promptText,
      canonicalOrganizationId: input.authority.canonicalOrganizationId,
      allowedClassifications: config.allowedClassifications,
      roles: input.authority.roles,
      permissions: input.authority.permissions,
      limit: config.maxRetrievalChunks,
    });
    for (const result of retrieval) yield { type: "citation", citation: result.citation };
    await writeAiAudit({
      authority: input.authority,
      eventType: "ai.retrieval.performed",
      action: `Retrieved ${retrieval.length} authorized AI source(s)`,
      requestId,
      conversationId,
      provider: provider.name,
      model,
      classification: request.classification,
      outcome: "completed",
      retrievalUsed: true,
    });
  }

  let toolResult: ToolExecutionResult | undefined;
  if (request.toolName) {
    toolResult = await executeAiTool({
      toolName: request.toolName,
      arguments: request.toolArguments ?? {},
      classification: request.classification,
      authority: input.authority,
      cookieHeader: input.cookieHeader,
      requestId,
    });
    yield { type: "tool_result", result: toolResult };
    await writeAiAudit({
      authority: input.authority,
      eventType: toolResult.status === "APPROVAL_REQUIRED" ? "ai.approval.created" : "ai.tool.executed",
      action: `${request.toolName}: ${toolResult.status}`,
      requestId,
      conversationId,
      provider: provider.name,
      model,
      classification: request.classification,
      outcome: "completed",
      toolCallsRequested: [request.toolName],
      toolCallsExecuted: toolResult.status === "SUCCEEDED" ? [request.toolName] : [],
      approvalRequired: toolResult.status === "APPROVAL_REQUIRED",
      approvalId: toolResult.approvalId,
    });
  }

  const providerRequest: AiChatRequest = {
    ...request,
    conversationId,
    model,
    messages: [
      { role: "system", content: buildMacTechSystemPrompt({ classification: request.classification, organizationId: input.authority.canonicalOrganizationId, retrieval, toolResult }) },
      ...request.messages,
    ],
  };
  let responseText = "";
  let usage: unknown;
  try {
    for await (const event of provider.streamChat(providerRequest, input.abortSignal)) {
      if (event.type === "delta") responseText += event.content;
      if (event.type === "done") usage = event.usage;
      yield event;
    }
    await writeAiAudit({
      authority: input.authority,
      eventType: "ai.chat.completed",
      action: "MacTech AI chat completed",
      requestId,
      conversationId,
      provider: provider.name,
      model,
      classification: request.classification,
      outcome: "completed",
      prompt: promptText,
      response: responseText,
      retrievalUsed: request.useRetrieval,
      toolCallsRequested: request.toolName ? [request.toolName] : [],
      toolCallsExecuted: toolResult?.status === "SUCCEEDED" && request.toolName ? [request.toolName] : [],
      approvalRequired: toolResult?.status === "APPROVAL_REQUIRED",
      approvalId: toolResult?.approvalId,
      tokenUsage: usage,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    await writeAiAudit({
      authority: input.authority,
      eventType: "ai.provider.failed",
      action: "AI provider request failed",
      requestId,
      conversationId,
      provider: provider.name,
      model,
      classification: request.classification,
      outcome: "failed",
      latencyMs: Date.now() - startedAt,
    });
    throw error;
  }
}
export function createProvider(config = getAiConfig()): AiProvider {
  if (config.provider === "nvidia") {
    if (!config.externalInferenceEnabled) throw new AiServiceError("external_inference_disabled", "NVIDIA external inference is disabled.", 503);
    return new NvidiaAiProvider({
      apiKey: config.nvidiaApiKey,
      baseUrl: config.baseUrl,
      defaultModel: config.defaultModel,
      maxOutputTokens: config.maxOutputTokens,
      timeoutMs: config.requestTimeoutMs,
    });
  }
  if (!config.developmentMode) throw new AiServiceError("mock_provider_forbidden", "The mock provider requires explicit AI_DEVELOPMENT_MODE=true.", 503);
  return new MockAiProvider();
}

export class AiServiceError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); this.name = "AiServiceError"; }
}
