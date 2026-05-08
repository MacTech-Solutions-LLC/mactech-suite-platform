/**
 * AgentOps planner — Slice 5.
 *
 * Translates a natural-language request into a sequence of validated
 * PlannedSteps. Two paths:
 *
 *  1. LLM path (when ENABLE_AI_PLANNER + OPENAI_API_KEY are configured):
 *     calls lib/agents/llm.ts, then validates every step against the
 *     code-defined registry. Any step naming an unknown capabilityKey
 *     or missing required inputs is dropped — never silently executed.
 *
 *  2. Deterministic path (always available): keyword-matches the request
 *     against a fixed table of known phrases. This is the fallback when
 *     the LLM is disabled OR returns malformed output. It guarantees
 *     the agent surface still works without AI configured — useful for
 *     local dev, demos, and assessor reviews.
 *
 * Defence in depth: even though the LLM system prompt says "only emit
 * keys from the allowlist", the validator here checks that contract
 * and discards rogue steps. The orchestrator validates again at
 * execute time, against the same registry.
 */

import { prisma } from "@/lib/db/prisma";
import { listCapabilities, getCapability } from "./capabilities/registry";
import {
  generatePlanFromLlm,
  plannerLlmConfigured,
  type LlmCapabilitySpec,
  type LlmPlanInput,
  type LlmPlanOutput,
} from "./llm";
import type { PlannedStep, PlannerResult } from "./types";

export async function planFromRequest(request: string): Promise<PlannerResult> {
  const capabilities = listCapabilities();
  const llmCapabilities: LlmCapabilitySpec[] = capabilities.map((c) => ({
    key: c.key,
    kind: c.kind === "read_only" ? "read_only" : "approval_required",
    label: c.label,
    description: c.description,
    required: c.inputSchema.required,
    optional: c.inputSchema.optional ?? [],
  }));

  if (plannerLlmConfigured()) {
    const ctx = await loadBindableContext();
    const input: LlmPlanInput = {
      request,
      capabilities: llmCapabilities,
      apps: ctx.apps,
      repos: ctx.repos,
    };
    const out = await generatePlanFromLlm(input);
    if (out) {
      const validated = validateLlmPlan(out);
      if (validated) return { ...validated, deterministic: false };
    }
    // Fall through to deterministic if LLM call failed / output was rejected.
  }

  return planDeterministically(request);
}

// ───────────────────────────────────────────────────────────────────────────
// LLM-path validation.
// ───────────────────────────────────────────────────────────────────────────

function validateLlmPlan(
  out: LlmPlanOutput,
): { planSummary: string; steps: PlannedStep[] } | null {
  const steps: PlannedStep[] = [];
  for (const s of out.steps) {
    const cap = getCapability(s.capabilityKey);
    if (!cap) {
      console.warn(`[agent-planner] LLM emitted unknown capability ${s.capabilityKey}`);
      return null; // Reject the entire plan so we fall back deterministic.
    }
    const missing = cap.inputSchema.required.filter(
      (k) => !(k in (s.input ?? {})),
    );
    if (missing.length > 0) {
      console.warn(
        `[agent-planner] LLM step ${s.capabilityKey} missing required inputs: ${missing.join(",")}`,
      );
      return null;
    }
    // Drop unknown input keys — the planner doesn't get to expand inputs.
    const allowed = new Set([
      ...cap.inputSchema.required,
      ...(cap.inputSchema.optional ?? []),
    ]);
    const input: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.input ?? {})) {
      if (allowed.has(k)) input[k] = v;
    }
    steps.push({
      capabilityKey: cap.key,
      kind: cap.kind,
      rationale: s.rationale,
      input,
    });
  }
  return { planSummary: out.planSummary, steps };
}

// ───────────────────────────────────────────────────────────────────────────
// Deterministic path. Cheap keyword matching against a hand-curated table.
// Conservative on intent: when in doubt, emit a read-only summarize_*
// capability rather than an approval_required one.
// ───────────────────────────────────────────────────────────────────────────

function planDeterministically(request: string): PlannerResult {
  const r = request.toLowerCase();
  const steps: PlannedStep[] = [];

  const has = (...needles: string[]): boolean =>
    needles.some((n) => r.includes(n));

  if (has("risk", "flag")) {
    steps.push({
      capabilityKey: "summarize_open_risks",
      kind: "read_only",
      rationale: "Request mentions risks; summarizing the open OperationalRiskFlag table.",
      input: { limit: 50 },
    });
  }
  if (has("ecosystem", "dependency", "graph")) {
    steps.push({
      capabilityKey: "read_ecosystem_graph",
      kind: "read_only",
      rationale: "Request mentions the ecosystem graph or dependencies.",
      input: {},
    });
  }
  if (has("app status", "health", "down", "degraded")) {
    steps.push({
      capabilityKey: "summarize_app_status",
      kind: "read_only",
      rationale: "Request mentions app health; pulling current status snapshot.",
      input: {},
    });
    if (has("down", "degraded", "failure", "fail")) {
      steps.push({
        capabilityKey: "inspect_health_failures",
        kind: "read_only",
        rationale: "Request asks about failures; surfacing recent failing health probes.",
        input: {},
      });
    }
  }
  if (has("deploy", "deployment", "drift")) {
    steps.push({
      capabilityKey: "summarize_deployment_drift",
      kind: "read_only",
      rationale: "Request mentions deployments; comparing prod against main.",
      input: {},
    });
  }
  if (has("workflow", "ci", "github actions", "actions run")) {
    steps.push({
      capabilityKey: "inspect_failed_workflows",
      kind: "read_only",
      rationale: "Request mentions CI workflows; listing recent failures.",
      input: {},
    });
  }
  if (has("commit", "repo activity", "what's been committed", "what shipped")) {
    steps.push({
      capabilityKey: "summarize_repo_activity",
      kind: "read_only",
      rationale: "Request asks about recent activity; pulling commits + workflow runs.",
      input: { limit: 30 },
    });
  }
  if (has("release notes", "release note")) {
    steps.push({
      capabilityKey: "summarize_recent_release_notes",
      kind: "read_only",
      rationale: "Request asks about release notes; listing recent CommitSummary rows.",
      input: { limit: 10 },
    });
  }
  if (has("repositor")) {
    steps.push({
      capabilityKey: "list_repositories",
      kind: "read_only",
      rationale: "Request asks about repositories; listing the linked roster.",
      input: {},
    });
  }

  const summary =
    steps.length === 0
      ? "Deterministic planner could not match the request to any capability. Try wording it more concretely (e.g. 'list open risks', 'summarize deployment drift') or enable the LLM planner via ENABLE_AI_PLANNER."
      : `Deterministic plan: ${steps.length} read-only step${steps.length === 1 ? "" : "s"} matched against keywords in the request. (Enable ENABLE_AI_PLANNER for an LLM-driven plan.)`;
  return { planSummary: summary, steps, deterministic: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

async function loadBindableContext() {
  const [apps, repos] = await Promise.all([
    prisma.appRegistry.findMany({
      where: { status: "active" },
      select: { id: true, appKey: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.gitRepository.findMany({
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return { apps, repos };
}
