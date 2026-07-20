import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import type { AiAuthority } from "@/lib/ai/auth/resolve-ai-authority";
import { assertToolEntitlement } from "@/lib/ai/auth/resolve-ai-authority";
import type { AiClassification } from "@/lib/ai/schemas/chat";
import { scanAndRedactSecrets } from "@/lib/ai/audit/redaction";
import { getToolDefinition } from "./tool-registry";

export interface ToolExecutionResult {
  toolName: string;
  status: "SUCCEEDED" | "APPROVAL_REQUIRED";
  riskLevel: string;
  data?: unknown;
  approvalId?: string;
  recordId?: string;
  recordUrl?: string;
  label?: string;
}
export async function executeAiTool(input: {
  toolName: string;
  arguments: Record<string, unknown>;
  classification: AiClassification;
  authority: AiAuthority;
  cookieHeader: string;
  requestId: string;
}): Promise<ToolExecutionResult> {
  const definition = getToolDefinition(input.toolName);
  if (!definition) throw new ToolPolicyError("unknown_tool", "Unknown AI tool.");
  if (!input.authority.permissions.includes(definition.requiredPermission)) throw new ToolPolicyError("permission_denied", "Permission denied for this AI tool.");
  if (!definition.allowedClassifications.includes(input.classification)) throw new ToolPolicyError("classification_denied", "The selected classification is not allowed for this tool.");
  await assertToolEntitlement(input.authority, definition.requiredAppEntitlement);
  const parsed = definition.inputSchema.safeParse(input.arguments);
  if (!parsed.success) throw new ToolPolicyError("invalid_arguments", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));

  if (definition.riskLevel === "CONSEQUENTIAL_WRITE") {
    return createApprovalRequest({ ...input, arguments: parsed.data as Record<string, unknown> });
  }
  if (definition.riskLevel === "PROHIBITED") throw new ToolPolicyError("tool_prohibited", "This tool is prohibited.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), definition.timeoutMs);
  try {
    switch (input.toolName) {
      case "suite.search_opportunities": {
        const baseUrl = requireBaseUrl(env.OPPORTUNITIES_BASE_URL, "Opportunity/Capture");
        const query = encodeURIComponent(String((parsed.data as { query: string }).query));
        const data = await domainFetch(`${baseUrl}/api/opportunities?search=${query}`, { method: "GET" }, input.cookieHeader, input.requestId, controller.signal);
        return { toolName: input.toolName, status: "SUCCEEDED", riskLevel: definition.riskLevel, data, label: "Opportunity search" };
      }
      case "suite.read_opportunity": {
        const baseUrl = requireBaseUrl(env.OPPORTUNITIES_BASE_URL, "Opportunity/Capture");
        const id = encodeURIComponent(String((parsed.data as { opportunityId: string }).opportunityId));
        const data = await domainFetch(`${baseUrl}/api/opportunities/${id}`, { method: "GET" }, input.cookieHeader, input.requestId, controller.signal);
        return { toolName: input.toolName, status: "SUCCEEDED", riskLevel: definition.riskLevel, data, label: "Opportunity record" };
      }
      case "suite.create_proposal_pursuit_draft": {
        const baseUrl = requireBaseUrl(env.PROPOSAL_BASE_URL, "ProposalOS");
        const args = parsed.data as { title: string; agency: string; proposalDueDate: string; notes?: string };
        const data = await domainFetch(`${baseUrl}/api/proposal/pursuits`, {
          method: "POST",
          body: JSON.stringify({ ...args, status: "DRAFT", riskLevel: "MEDIUM", submissionMethod: "PORTAL" }),
        }, input.cookieHeader, input.requestId, controller.signal) as Record<string, unknown>;
        const domainData = data.data as Record<string, unknown> | undefined;
        const recordId = typeof domainData?.pursuitId === "string" ? domainData.pursuitId : undefined;
        if (!recordId) throw new ToolPolicyError("domain_confirmation_missing", "ProposalOS did not confirm the draft record ID.");
        return {
          toolName: input.toolName,
          status: "SUCCEEDED",
          riskLevel: definition.riskLevel,
          data: { ...data, draftStatus: "DRAFT", approvalStatus: "UNAPPROVED" },
          recordId,
          recordUrl: `${baseUrl}/proposal/pursuits/${encodeURIComponent(recordId)}`,
          label: "ProposalOS DRAFT pursuit",
        };
      }
      default:
        throw new ToolPolicyError("tool_not_implemented", "This registered tool has no executor.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function createApprovalRequest(input: {
  toolName: string;
  arguments: Record<string, unknown>;
  authority: AiAuthority;
  requestId: string;
}): Promise<ToolExecutionResult> {
  const idempotencyKey = typeof input.arguments.idempotencyKey === "string" ? input.arguments.idempotencyKey : input.requestId;
  const requestText = `[MacTech AI approval:${idempotencyKey}] ${input.toolName}`;
  const existing = await prisma.agentRun.findFirst({ where: { requestText, status: { in: ["awaiting_approval", "approved", "running", "completed"] } } });
  if (existing) return { toolName: input.toolName, status: "APPROVAL_REQUIRED", riskLevel: "CONSEQUENTIAL_WRITE", approvalId: existing.id, label: "Existing human approval request" };
  const preview = scanAndRedactSecrets(String(input.arguments.preview ?? JSON.stringify(input.arguments))).redacted.slice(0, 4000);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const run = await prisma.agentRun.create({
    data: {
      status: "awaiting_approval",
      requestText,
      planSummary: `AI proposed ${input.toolName}. Automatic execution is disabled. Review the redacted preview and authority before any domain action.`,
      deterministicPlan: true,
      plannedStepCount: 1,
      requiresApproval: true,
      requestedByClerkUserId: input.authority.clerkUserId,
      requestedByEmail: input.authority.actorEmail,
      intentGoal: `Review the proposed ${input.toolName} action; do not execute automatically.`,
      intentScopeAppIds: ["proposal"],
      intentScopeRepoIds: [],
      intentInvariantsJson: { aiControls: ["human_approval", "revalidate_authority", "no_automatic_execution"] } as Prisma.InputJsonValue,
      intentValidationJson: { passed: true, source: "mactech-ai" } as Prisma.InputJsonValue,
      steps: {
        create: {
          stepIndex: 1,
          capabilityKey: `ai_pending:${input.toolName}`,
          capabilityVersion: 1,
          kind: "approval_required",
          status: "planned",
          rationale: "Consequential AI actions require a separate human approval and remain disabled in the developer MVP.",
          inputJson: { argumentsHash: scanAndRedactSecrets(JSON.stringify(input.arguments)).redacted, redactedPreview: preview, expiresAt, requiredApproverPermission: "ai.approve", idempotencyKey } as Prisma.InputJsonValue,
        },
      },
    },
  });
  return { toolName: input.toolName, status: "APPROVAL_REQUIRED", riskLevel: "CONSEQUENTIAL_WRITE", approvalId: run.id, data: { redactedPreview: preview, expiresAt, executionEnabled: false }, label: "Human approval required" };
}

async function domainFetch(url: string, init: RequestInit, cookieHeader: string, requestId: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal,
    headers: { "content-type": "application/json", cookie: cookieHeader, "x-mactech-request-id": requestId, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) throw new ToolPolicyError("domain_request_failed", `Domain application rejected the request (${response.status}).`);
  return body;
}

function requireBaseUrl(value: string | undefined, label: string): string {
  if (!value) throw new ToolPolicyError("adapter_not_configured", `${label} adapter is not configured.`);
  return value.replace(/\/$/, "");
}

export class ToolPolicyError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "ToolPolicyError"; }
}
