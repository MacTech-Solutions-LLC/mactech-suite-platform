/**
 * Shared types for the AgentOps runtime (Slice 5).
 *
 * The runtime has three layers and they only talk through these types:
 *   1. Planner (lib/agents/planner.ts) — natural language → PlannedStep[].
 *   2. Capability registry (lib/agents/capabilities/) — code-defined,
 *      validated set of step kinds with input/output schemas.
 *   3. Orchestrator (lib/agents/orchestrator.ts) — lifecycle state machine
 *      that persists AgentRun / AgentStep / AgentArtifact / AgentApproval.
 *
 * No type in this file ever holds a token, secret, or credential — the
 * agent runtime operates on resource IDs only.
 */

import type { AgentArtifactKind, AgentStepKind } from "@prisma/client";

/** A single step the planner emitted; not yet persisted. */
export interface PlannedStep {
  capabilityKey: string;
  kind: AgentStepKind;
  rationale: string;
  input: Record<string, unknown>;
}

/** Output of the planner, before it's saved as an AgentRun. */
export interface PlannerResult {
  /** Plain-English single-paragraph summary of the plan. */
  planSummary: string;
  steps: PlannedStep[];
  /** True if the planner ran without an LLM (fallback / not configured). */
  deterministic: boolean;
}

/** Compact return from a capability invocation. Big data goes to artifacts. */
export interface CapabilityResult {
  /** Brief structured output stored on the AgentStep row. */
  summary: Record<string, unknown>;
  /** Optional artifacts (release notes markdown, large JSON dumps, etc.). */
  artifacts?: Array<{
    kind: AgentArtifactKind;
    title: string;
    bodyMarkdown: string;
    payloadJson?: Record<string, unknown>;
  }>;
}

/** Context the orchestrator hands to a capability when it's executed. */
export interface CapabilityContext {
  /** AgentRun id — capabilities thread this through to writeAuditLog. */
  agentRunId: string;
  /** AgentStep id — capabilities thread this through to writeAuditLog. */
  agentStepId: string;
  /** Clerk user id of the requester (for audit + permission re-check). */
  requesterClerkUserId: string;
  /** Email of the requester (for audit). */
  requesterEmail: string;
  /** Clerk user id of the approver if the step is approval-required. */
  approverClerkUserId: string | null;
  /** Email of the approver if the step is approval-required. */
  approverEmail: string | null;
}

export interface CapabilityInputSchema {
  /** Required input keys for this capability — checked before execution. */
  required: readonly string[];
  /** Optional input keys — silently allowed. */
  optional?: readonly string[];
}

export interface Capability {
  key: string;
  kind: AgentStepKind;
  /** Human-readable label shown in the approval UI. */
  label: string;
  /** What the capability does, surfaced to the planner system prompt + UI. */
  description: string;
  /** Inputs the planner must bind. */
  inputSchema: CapabilityInputSchema;
  /** Permission the requester must hold to even include this in a plan. */
  requesterPermission: string;
  /** The handler. Receives validated input + ctx, returns CapabilityResult. */
  invoke(input: Record<string, unknown>, ctx: CapabilityContext): Promise<CapabilityResult>;
}
