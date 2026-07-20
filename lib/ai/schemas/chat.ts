import { z } from "zod";

export const AiClassificationSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "FCI",
  "CUI",
  "EXPORT_CONTROLLED",
  "SECRET",
  "UNKNOWN",
]);

export type AiClassification = z.infer<typeof AiClassificationSchema>;

export const AiMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().min(1).max(100_000),
  name: z.string().min(1).max(100).optional(),
  toolCallId: z.string().min(1).max(200).optional(),
});

export const AiChatRequestSchema = z.object({
  conversationId: z.string().min(1).max(200).optional(),
  organizationId: z.string().min(1).max(200),
  classification: AiClassificationSchema,
  messages: z.array(AiMessageSchema).min(1).max(30),
  model: z.string().min(1).max(200).optional(),
  useRetrieval: z.boolean().default(false),
  retrievalQuery: z.string().min(1).max(4000).optional(),
  toolName: z.string().min(1).max(120).optional(),
  toolArguments: z.record(z.string(), z.unknown()).optional(),
});

export type AiMessage = z.infer<typeof AiMessageSchema>;
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

export interface AiModel {
  id: string;
  provider: string;
  supportsStreaming: boolean;
  supportsTools: boolean;
}

export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiChatResponse {
  id: string;
  model: string;
  content: string;
  finishReason?: string;
  toolCalls?: AiToolCall[];
  usage?: AiUsage;
}

export type AiStreamEvent =
  | { type: "start"; id: string; model: string }
  | { type: "delta"; content: string }
  | { type: "tool_call"; toolCall: AiToolCall }
  | { type: "done"; finishReason?: string; usage?: AiUsage }
  | { type: "error"; code: string; message: string };
