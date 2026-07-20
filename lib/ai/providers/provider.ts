import type {
  AiChatRequest,
  AiChatResponse,
  AiModel,
  AiStreamEvent,
} from "@/lib/ai/schemas/chat";

export interface ProviderHealth {
  ok: boolean;
  provider: string;
  detail: string;
  checkedAt: string;
}
export interface AiProvider {
  readonly name: string;
  listModels(signal?: AbortSignal): Promise<AiModel[]>;
  chat(request: AiChatRequest, signal?: AbortSignal): Promise<AiChatResponse>;
  streamChat(request: AiChatRequest, signal?: AbortSignal): AsyncIterable<AiStreamEvent>;
  healthCheck(signal?: AbortSignal): Promise<ProviderHealth>;
}

export class AiProviderError extends Error {
  constructor(
    public readonly code: "not_configured" | "timeout" | "rate_limited" | "invalid_model" | "rejected" | "unavailable" | "malformed_response",
    message: string,
    public readonly retryable = false,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
