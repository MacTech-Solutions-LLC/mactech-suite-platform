import { randomUUID } from "crypto";
import type { AiChatRequest, AiChatResponse, AiModel, AiStreamEvent, AiToolCall } from "@/lib/ai/schemas/chat";
import { AiProviderError, type AiProvider, type ProviderHealth } from "./provider";

interface NvidiaProviderOptions {
  apiKey?: string;
  baseUrl: string;
  defaultModel?: string;
  maxOutputTokens: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}
export class NvidiaAiProvider implements AiProvider {
  readonly name = "nvidia";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: NvidiaProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listModels(signal?: AbortSignal): Promise<AiModel[]> {
    const response = await this.request("/models", { method: "GET" }, signal);
    const body = await safeJson(response);
    const data = Array.isArray(body.data) ? body.data : [];
    return data.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || typeof (entry as { id?: unknown }).id !== "string") return [];
      return [{ id: (entry as { id: string }).id, provider: this.name, supportsStreaming: true, supportsTools: true }];
    });
  }

  async chat(request: AiChatRequest, signal?: AbortSignal): Promise<AiChatResponse> {
    const model = this.resolveModel(request.model);
    const response = await this.request("/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model, messages: request.messages, max_tokens: this.options.maxOutputTokens, stream: false }),
    }, signal);
    const body = await safeJson(response);
    const choice = Array.isArray(body.choices) ? body.choices[0] as Record<string, unknown> | undefined : undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const content = typeof message?.content === "string" ? message.content : "";
    if (!choice || (!content && !Array.isArray(message?.tool_calls))) {
      throw new AiProviderError("malformed_response", "The NVIDIA provider returned an invalid completion.");
    }
    return {
      id: typeof body.id === "string" ? body.id : `nvidia-${randomUUID()}`,
      model: typeof body.model === "string" ? body.model : model,
      content,
      finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
      toolCalls: parseToolCalls(message?.tool_calls),
      usage: parseUsage(body.usage),
    };
  }

  async *streamChat(request: AiChatRequest, signal?: AbortSignal): AsyncIterable<AiStreamEvent> {
    const model = this.resolveModel(request.model);
    const response = await this.request("/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model, messages: request.messages, max_tokens: this.options.maxOutputTokens, stream: true, stream_options: { include_usage: true } }),
    }, signal);
    if (!response.body) throw new AiProviderError("malformed_response", "The NVIDIA provider returned no response stream.");
    yield { type: "start", id: `nvidia-${randomUUID()}`, model };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          for (const line of frame.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            let parsed: Record<string, unknown>;
            try { parsed = JSON.parse(data) as Record<string, unknown>; } catch { continue; }
            const choice = Array.isArray(parsed.choices) ? parsed.choices[0] as Record<string, unknown> | undefined : undefined;
            const delta = choice?.delta as Record<string, unknown> | undefined;
            if (typeof delta?.content === "string" && delta.content) yield { type: "delta", content: delta.content };
            for (const toolCall of parseToolCalls(delta?.tool_calls) ?? []) yield { type: "tool_call", toolCall };
            if (choice?.finish_reason) yield { type: "done", finishReason: String(choice.finish_reason), usage: parseUsage(parsed.usage) };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      const models = await this.listModels(signal);
      return { ok: models.length > 0, provider: this.name, detail: `${models.length} model(s) available`, checkedAt: new Date().toISOString() };
    } catch (error) {
      return { ok: false, provider: this.name, detail: safeProviderMessage(error), checkedAt: new Date().toISOString() };
    }
  }

  private resolveModel(requested?: string): string {
    const model = requested ?? this.options.defaultModel;
    if (!model) throw new AiProviderError("invalid_model", "No NVIDIA chat model is configured.");
    return model;
  }

  private async request(path: string, init: RequestInit, callerSignal?: AbortSignal): Promise<Response> {
    if (!this.options.apiKey) throw new AiProviderError("not_configured", "NVIDIA inference is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const abort = () => controller.abort();
    callerSignal?.addEventListener("abort", abort, { once: true });
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
            ...init,
            headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}`, ...(init.headers ?? {}) },
            signal: controller.signal,
          });
          if (response.ok) return response;
          const error = normalizeStatus(response.status);
          if (error.retryable && attempt === 0) continue;
          throw error;
        } catch (error) {
          if (controller.signal.aborted) throw new AiProviderError("timeout", "The NVIDIA request timed out.", false, 504);
          if (error instanceof AiProviderError) throw error;
          if (attempt === 0) continue;
          throw new AiProviderError("unavailable", "The NVIDIA provider is unavailable.", true, 503);
        }
      }
      throw new AiProviderError("unavailable", "The NVIDIA provider is unavailable.", true, 503);
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abort);
    }
  }
}

function normalizeStatus(status: number): AiProviderError {
  if (status === 404) return new AiProviderError("invalid_model", "The configured NVIDIA model is unavailable.", false, status);
  if (status === 429) return new AiProviderError("rate_limited", "The NVIDIA provider rate limit was reached.", true, status);
  if (status >= 500) return new AiProviderError("unavailable", "The NVIDIA provider is temporarily unavailable.", true, status);
  return new AiProviderError("rejected", "The NVIDIA provider rejected the request.", false, status);
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; } catch { throw new AiProviderError("malformed_response", "The provider response was not valid JSON."); }
}

function parseUsage(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  return {
    promptTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
    completionTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
    totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
  };
}

function parseToolCalls(value: unknown): AiToolCall[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const fn = row.function as Record<string, unknown> | undefined;
    if (!fn || typeof fn.name !== "string") return [];
    let args: Record<string, unknown> = {};
    if (typeof fn.arguments === "string") {
      try { const parsed = JSON.parse(fn.arguments); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed; } catch { return []; }
    }
    return [{ id: typeof row.id === "string" ? row.id : `tool-${index}`, name: fn.name, arguments: args }];
  });
}

export function safeProviderMessage(error: unknown): string {
  return error instanceof AiProviderError ? error.message : "Provider health check failed.";
}
