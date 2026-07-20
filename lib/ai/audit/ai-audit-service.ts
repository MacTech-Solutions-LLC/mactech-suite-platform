import { writeAuditLog } from "@/lib/audit";
import type { AiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import type { AiClassification } from "@/lib/ai/schemas/chat";
import { contentHash, scanAndRedactSecrets } from "./redaction";

export async function writeAiAudit(input: {
  authority: AiAuthority;
  eventType: string;
  action: string;
  requestId: string;
  conversationId?: string;
  provider?: string;
  model?: string;
  classification: AiClassification;
  outcome: string;
  latencyMs?: number;
  prompt?: string;
  response?: string;
  retrievalUsed?: boolean;
  toolCallsRequested?: string[];
  toolCallsExecuted?: string[];
  approvalRequired?: boolean;
  approvalId?: string;
  tokenUsage?: unknown;
}) {
  const promptScan = scanAndRedactSecrets(input.prompt ?? "");
  const responseScan = scanAndRedactSecrets(input.response ?? "");
  return writeAuditLog({
    eventType: input.eventType,
    eventCategory: "system",
    severity: input.outcome === "blocked" || input.outcome === "failed" ? "warning" : "info",
    action: input.action,
    actorClerkUserId: input.authority.clerkUserId,
    actorEmail: input.authority.actorEmail,
    actorUserProfileId: input.authority.actorUserId,
    customerOrganizationId: input.authority.canonicalOrganizationId,
    appRegistryId: input.authority.appRegistryId,
    resourceType: "MacTechAiRequest",
    resourceId: input.requestId,
    requestId: input.requestId,
    metadata: {
      sourceAppKey: "mactech-ai",
      activeTenantContext: input.authority.canonicalOrganizationId,
      conversationId: input.conversationId ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      classification: input.classification,
      retrievalUsed: input.retrievalUsed ?? false,
      toolCallsRequested: input.toolCallsRequested ?? [],
      toolCallsExecuted: input.toolCallsExecuted ?? [],
      approvalRequired: input.approvalRequired ?? false,
      approvalId: input.approvalId ?? null,
      outcome: input.outcome,
      latencyMs: input.latencyMs ?? null,
      tokenUsage: input.tokenUsage ?? null,
      promptHash: input.prompt ? contentHash(input.prompt) : null,
      responseHash: input.response ? contentHash(input.response) : null,
      promptRedactedExcerpt: input.prompt ? promptScan.redacted.slice(0, 180) : null,
      responseRedactedExcerpt: input.response ? responseScan.redacted.slice(0, 180) : null,
      secretLabels: Array.from(new Set(promptScan.labels.concat(responseScan.labels))),
    },
  });
}
