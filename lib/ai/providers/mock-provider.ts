import { createHash, randomUUID } from "crypto";
import type { AiProvider, ProviderHealth } from "./provider";
import type { AiChatRequest, AiChatResponse, AiModel, AiStreamEvent } from "@/lib/ai/schemas/chat";

export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  async listModels(): Promise<AiModel[]> {
    return [{ id: "mactech/mock-deterministic-v1", provider: this.name, supportsStreaming: true, supportsTools: true }];
  }

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const content = buildMockAnswer(request);
    return {
      id: `mock-${randomUUID()}`,
      model: request.model ?? "mactech/mock-deterministic-v1",
      content,
      finishReason: "stop",
      usage: { promptTokens: Math.ceil(JSON.stringify(request.messages).length / 4), completionTokens: Math.ceil(content.length / 4) },
    };
  }

  async *streamChat(request: AiChatRequest): AsyncIterable<AiStreamEvent> {
    const response = await this.chat(request);
    yield { type: "start", id: response.id, model: response.model };
    for (const chunk of response.content.match(/.{1,28}(?:\s|$)/g) ?? [response.content]) {
      yield { type: "delta", content: chunk };
    }
    yield { type: "done", finishReason: response.finishReason, usage: response.usage };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, provider: this.name, detail: "Deterministic development provider ready", checkedAt: new Date().toISOString() };
  }
}
function buildMockAnswer(request: AiChatRequest): string {
  const last = [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const fingerprint = createHash("sha256").update(last).digest("hex").slice(0, 8);
  return `MacTech AI development response (${fingerprint}). I treated the supplied material as ${request.classification} and used only the authorized context provided with this request. ${last.slice(0, 240)}`;
}
