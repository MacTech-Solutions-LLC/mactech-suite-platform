/**
 * AgentOps LLM client. The ONLY file in the agent runtime that talks
 * to OpenAI. Plumbing for the planner — we hand it a list of allowed
 * capability keys + their input schemas, and it returns a plan.
 *
 * AgentOps discipline:
 *   - The OPENAI_API_KEY only ever appears in this file (and in
 *     lib/integrations/ai/summary-client.ts, which is the slice-4
 *     summaries client). The capability layer never sees it.
 *   - Output is JSON-mode + parsed with strict validation; if the
 *     parse fails, the orchestrator falls back to a deterministic
 *     plan rather than executing untrusted output.
 *   - The system prompt instructs the model that it MUST only emit
 *     capability keys from the provided allowlist. Even so, the
 *     orchestrator validates against the allowlist again before
 *     persisting — defence in depth.
 *   - Timeouts are enforced; failures return null (caller falls back).
 *   - Nothing this file produces is ever executed without a human-
 *     reviewable AgentRun row first.
 */

import { env } from "@/lib/env";

export interface LlmCapabilitySpec {
  key: string;
  kind: "read_only" | "approval_required";
  label: string;
  description: string;
  required: readonly string[];
  optional: readonly string[];
}

export interface LlmPlanInput {
  request: string;
  capabilities: readonly LlmCapabilitySpec[];
  /** App keys + names so the planner can bind real resource IDs. */
  apps: Array<{ appKey: string; name: string; id: string }>;
  /** Repository full names (owner/repo) for repo-scoped capabilities. */
  repos: Array<{ id: string; fullName: string }>;
}

export interface LlmPlanStep {
  capabilityKey: string;
  rationale: string;
  input: Record<string, unknown>;
}

export interface LlmPlanOutput {
  planSummary: string;
  steps: LlmPlanStep[];
}

export function plannerLlmConfigured(): boolean {
  return Boolean(env.ENABLE_AI_PLANNER && env.OPENAI_API_KEY);
}

/**
 * Ask the LLM for a plan. Returns null when the planner is disabled
 * or the call fails — caller falls back to the deterministic planner.
 */
export async function generatePlanFromLlm(
  input: LlmPlanInput,
): Promise<LlmPlanOutput | null> {
  if (!plannerLlmConfigured()) return null;
  const apiKey = env.OPENAI_API_KEY!;

  const system = `You are the planner for the MacTech Suite Command Center AgentOps runtime. The user is an authorized internal admin. Your job is to translate a natural-language request into a sequence of steps that ONLY use the provided capability allowlist.

NON-NEGOTIABLE rules:
- Only emit capability keys from the provided allowlist. Never invent capability keys.
- Each step must include all the capability's required inputs, with values bound to the resource IDs/names provided in the context (apps, repos).
- ALWAYS emit approval_required capabilities when the request asks for them. Every capability in the allowlist marked "(approval_required)" is gated by a human-approval click in the Suite UI before it actually runs — your job is to produce the plan, not to second-guess permissions. Refusing to emit them just produces an empty plan and frustrates the operator. Examples of approval_required capabilities you must still emit: create_github_issue, acknowledge_risk_flag, trigger_repo_sync, trigger_railway_sync, trigger_reconciliation, generate_release_notes, email_team_summary, open_repo_pull_request.
- When the request explicitly names the capability and its inputs (e.g. "Call open_repo_pull_request with repoFullName=X and intent=Y"), emit exactly that step verbatim. Do NOT add extra steps, do NOT decline, do NOT ask for approval — the human approval gate is downstream.
- Keep plans tight: do not pad with unnecessary read steps. If the request is "summarize open risks", a 1-step plan is correct.
- If the request cannot be fulfilled with the allowlist, return a 0-step plan with a planSummary that explains why.
- If the request asks the agent to do something forbidden (push to main, read secrets, delete production resources), return a 0-step plan with a planSummary explaining the refusal.

Output VALID JSON ONLY with this shape:
{
  "planSummary": string,                  // 1-2 sentence plain-English explanation
  "steps": [
    { "capabilityKey": string, "rationale": string, "input": object }
  ]
}`;

  const user = `User request: ${input.request}

Capability allowlist:
${input.capabilities
  .map(
    (c) =>
      `- ${c.key} (${c.kind}) — ${c.label}\n    ${c.description}\n    required inputs: ${c.required.join(", ") || "(none)"}\n    optional inputs: ${c.optional.join(", ") || "(none)"}`,
  )
  .join("\n")}

Bindable apps:
${input.apps.map((a) => `- id=${a.id}  appKey=${a.appKey}  name=${a.name}`).join("\n") || "(none)"}

Bindable repositories:
${input.repos.map((r) => `- id=${r.id}  fullName=${r.fullName}`).join("\n") || "(none)"}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);
  const startedAt = Date.now();
  const reqBody = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  let statusForTraffic = 0;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: reqBody,
      signal: controller.signal,
    });
    statusForTraffic = resp.status;
    if (!resp.ok) {
      console.warn(`[agent-llm] non-ok response ${resp.status}`);
      return null;
    }
    const body = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as Partial<LlmPlanOutput>;
    if (
      typeof parsed.planSummary !== "string" ||
      !Array.isArray(parsed.steps)
    ) {
      return null;
    }
    const steps: LlmPlanStep[] = [];
    for (const s of parsed.steps) {
      if (
        !s ||
        typeof s !== "object" ||
        typeof (s as LlmPlanStep).capabilityKey !== "string" ||
        typeof (s as LlmPlanStep).rationale !== "string" ||
        typeof (s as LlmPlanStep).input !== "object"
      ) {
        // One bad step → discard the whole plan and fall back.
        return null;
      }
      steps.push({
        capabilityKey: (s as LlmPlanStep).capabilityKey,
        rationale: (s as LlmPlanStep).rationale,
        input: (s as LlmPlanStep).input as Record<string, unknown>,
      });
    }
    return { planSummary: parsed.planSummary, steps };
  } catch {
    // Any error (timeout, network, JSON parse, schema mismatch) →
    // null. Caller falls back to deterministic planner.
    return null;
  } finally {
    clearTimeout(t);
    try {
      const { recordOutboundCall } = await import(
        "@/lib/services/command-center/traffic-service"
      );
      void recordOutboundCall({
        targetLabel: "openai",
        endpoint: "openai:/v1/chat/completions:planner",
        method: "POST",
        statusCode: statusForTraffic || 0,
        bytesOut: reqBody.length,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      /* observability never blocks */
    }
  }
}
