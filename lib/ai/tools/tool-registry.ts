import { z } from "zod";
import type { AiClassification } from "@/lib/ai/schemas/chat";

export type ToolRiskLevel = "READ_ONLY" | "DRAFT_CREATE" | "CONSEQUENTIAL_WRITE" | "PROHIBITED";

export interface AiToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: T;
  sourceApplication: string;
  requiredAppEntitlement: string;
  requiredPermission: string;
  allowedClassifications: AiClassification[];
  riskLevel: ToolRiskLevel;
  approvalPolicy: "NONE" | "HUMAN_REQUIRED" | "DISABLED";
  timeoutMs: number;
  auditEventType: string;
}
const PUBLIC_INTERNAL: AiClassification[] = ["PUBLIC", "INTERNAL"];

export const AI_TOOL_REGISTRY = {
  "suite.search_opportunities": {
    name: "suite.search_opportunities",
    description: "Search authorized Opportunity/Capture records.",
    inputSchema: z.object({ query: z.string().min(1).max(300) }).strict(),
    sourceApplication: "growth-capture",
    requiredAppEntitlement: "growth-capture",
    requiredPermission: "ai.tool.read",
    allowedClassifications: PUBLIC_INTERNAL,
    riskLevel: "READ_ONLY",
    approvalPolicy: "NONE",
    timeoutMs: 8000,
    auditEventType: "ai.tool.executed",
  },
  "suite.read_opportunity": {
    name: "suite.read_opportunity",
    description: "Read one authorized Opportunity/Capture record.",
    inputSchema: z.object({ opportunityId: z.string().min(1).max(200) }).strict(),
    sourceApplication: "growth-capture",
    requiredAppEntitlement: "growth-capture",
    requiredPermission: "ai.tool.read",
    allowedClassifications: PUBLIC_INTERNAL,
    riskLevel: "READ_ONLY",
    approvalPolicy: "NONE",
    timeoutMs: 8000,
    auditEventType: "ai.tool.executed",
  },
  "suite.create_proposal_pursuit_draft": {
    name: "suite.create_proposal_pursuit_draft",
    description: "Create an explicitly unapproved DRAFT pursuit in ProposalOS.",
    inputSchema: z.object({
      title: z.string().min(3).max(200),
      agency: z.string().min(2).max(200),
      proposalDueDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid proposalDueDate"),
      notes: z.string().max(4000).optional(),
    }).strict(),
    sourceApplication: "proposal",
    requiredAppEntitlement: "proposal",
    requiredPermission: "ai.tool.draft",
    allowedClassifications: PUBLIC_INTERNAL,
    riskLevel: "DRAFT_CREATE",
    approvalPolicy: "NONE",
    timeoutMs: 10000,
    auditEventType: "ai.tool.executed",
  },
  "suite.submit_proposal": {
    name: "suite.submit_proposal",
    description: "Request submission of a proposal. Disabled for automatic execution in the NVIDIA developer MVP.",
    inputSchema: z.object({ pursuitId: z.string().min(1).max(200), preview: z.string().min(1).max(4000) }).strict(),
    sourceApplication: "proposal",
    requiredAppEntitlement: "proposal",
    requiredPermission: "ai.tool.execute",
    allowedClassifications: PUBLIC_INTERNAL,
    riskLevel: "CONSEQUENTIAL_WRITE",
    approvalPolicy: "HUMAN_REQUIRED",
    timeoutMs: 10000,
    auditEventType: "ai.approval.created",
  },
} satisfies Record<string, AiToolDefinition>;

export type AiToolName = keyof typeof AI_TOOL_REGISTRY;

export function getToolDefinition(name: string): AiToolDefinition | null {
  return Object.prototype.hasOwnProperty.call(AI_TOOL_REGISTRY, name)
    ? AI_TOOL_REGISTRY[name as AiToolName]
    : null;
}
