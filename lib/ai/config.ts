import { env } from "@/lib/env";
import { AiClassificationSchema, type AiClassification } from "@/lib/ai/schemas/chat";

export interface AiConfig {
  enabled: boolean;
  provider: "nvidia" | "mock";
  externalInferenceEnabled: boolean;
  developmentMode: boolean;
  nvidiaApiKey?: string;
  baseUrl: string;
  defaultModel?: string;
  maxInputChars: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  allowedClassifications: AiClassification[];
  storeConversationContent: boolean;
  auditRetentionDays: number;
  maxRetrievalChunks: number;
}
export function getAiConfig(): AiConfig {
  const allowed = env.AI_ALLOWED_CLASSIFICATIONS.split(",")
    .map((value) => value.trim().toUpperCase())
    .flatMap((value) => {
      const parsed = AiClassificationSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    });
  return {
    enabled: env.AI_ENABLED,
    provider: env.AI_PROVIDER,
    externalInferenceEnabled: env.AI_EXTERNAL_INFERENCE_ENABLED,
    developmentMode: env.AI_DEVELOPMENT_MODE,
    nvidiaApiKey: env.NVIDIA_API_KEY,
    baseUrl: env.NVIDIA_BASE_URL.replace(/\/$/, ""),
    defaultModel: env.NVIDIA_CHAT_MODEL,
    maxInputChars: env.AI_MAX_INPUT_CHARS,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    allowedClassifications: allowed,
    storeConversationContent: env.AI_STORE_CONVERSATION_CONTENT,
    auditRetentionDays: env.AI_AUDIT_RETENTION_DAYS,
    maxRetrievalChunks: env.AI_MAX_RETRIEVAL_CHUNKS,
  };
}
