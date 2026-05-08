/**
 * Intent goal validator — Slice 5.5.
 *
 * Ports /Users/patrick/IBE/src/intent/validator.ts to the AgentOps
 * runtime. The doctrine: a goal is machine-checkable only if it starts
 * with an allowed verb, contains a measurable-outcome keyword, and
 * carries no vague-word freight ("improve", "better", "optimize", …).
 *
 * Conservatism: false-negative > false-positive. When in doubt the
 * validator refuses, and the user has to reword. That is the IBE
 * doctrine and the Slice 5.5 contract.
 */

import { prisma } from "@/lib/db/prisma";
import { listCapabilities } from "../capabilities/registry";
import { listInvariants } from "./invariants";
import type {
  Intent,
  IntentValidationError,
  IntentValidationResult,
} from "./types";

// ───────────────────────────────────────────────────────────────────────────
// IBE goal-text rules (ported verbatim from /Users/patrick/IBE).
// ───────────────────────────────────────────────────────────────────────────

const ALLOWED_VERBS = [
  "ensure",
  "prevent",
  "maintain",
  "enforce",
  "guarantee",
  "preserve",
  // AgentOps additions — these are imperative + machine-checkable too.
  "summarize",
  "list",
  "inspect",
  "acknowledge",
  "trigger",
  "generate",
  "create",
  "read",
] as const;

const FORBIDDEN_VAGUE_WORDS = [
  "improve",
  "better",
  "optimize",
  "enhance",
  "fix",
  "refactor",
  "clean",
  "modernize",
  "simplify",
  "good",
  "bad",
  "nice",
  "elegant",
  "readable",
  "maintainable",
] as const;

const AMBIGUOUS_WORDS = ["performance", "efficiency", "quality"] as const;

const MEASURABLE_OUTCOMES = [
  "capacity",
  "count",
  "rate",
  "limit",
  "threshold",
  "size",
  "bytes",
  "memory",
  "allow",
  "deny",
  "enabled",
  "disabled",
  "active",
  "inactive",
  "seconds",
  "milliseconds",
  "duration",
  "interval",
  // AgentOps additions — concrete observable nouns the agent can act on.
  "risk",
  "risks",
  "deployment",
  "deployments",
  "drift",
  "commit",
  "commits",
  "workflow",
  "workflows",
  "issue",
  "issues",
  "release",
  "summary",
  "snapshot",
  "repository",
  "repositories",
  "ecosystem",
  "health",
  "app",
  "apps",
] as const;

// ───────────────────────────────────────────────────────────────────────────
// Goal validation
// ───────────────────────────────────────────────────────────────────────────

export function validateGoalText(goal: string): IntentValidationError[] {
  const errors: IntentValidationError[] = [];
  const trimmed = goal.trim();

  if (trimmed.length < 10 || trimmed.length > 240) {
    errors.push({
      type: "intent",
      details: `Goal must be 10–240 characters (got ${trimmed.length}).`,
    });
    return errors;
  }

  if (!trimmed.endsWith(".")) {
    errors.push({
      type: "intent",
      details: "Goal must be a single sentence ending in a period.",
    });
  }

  const sentenceCount = (trimmed.match(/\./g) ?? []).length;
  if (sentenceCount > 1) {
    errors.push({
      type: "intent",
      details: "Goal must be a single sentence (multiple periods detected).",
    });
  }

  const lower = trimmed.toLowerCase();
  if (!ALLOWED_VERBS.some((v) => lower.startsWith(v))) {
    errors.push({
      type: "intent",
      details: `Goal must begin with an allowed verb (${ALLOWED_VERBS.join(", ")}).`,
    });
  }

  for (const word of FORBIDDEN_VAGUE_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(trimmed)) {
      errors.push({
        type: "intent",
        details: `Goal contains forbidden vague word: "${word}".`,
      });
    }
  }

  for (const word of AMBIGUOUS_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(trimmed)) {
      errors.push({
        type: "ambiguity",
        details: `Goal contains ambiguous word "${word}" — clarify what you mean.`,
      });
    }
  }

  const hasMeasurable = MEASURABLE_OUTCOMES.some((m) =>
    new RegExp(`\\b${m}\\b`, "i").test(trimmed),
  );
  if (!hasMeasurable) {
    errors.push({
      type: "intent",
      details:
        "Goal must contain at least one measurable-outcome keyword (e.g. risk, deployment, drift, commit, count, limit, …).",
    });
  }

  return errors;
}

// ───────────────────────────────────────────────────────────────────────────
// Full intent validation: goal + scope + invariants + risk tolerance.
// ───────────────────────────────────────────────────────────────────────────

export async function validateIntent(intent: Intent): Promise<IntentValidationResult> {
  const errors: IntentValidationError[] = [];

  errors.push(...validateGoalText(intent.goal));

  // Scope: every appId / repoId must exist. Empty array == unbounded
  // (legitimate: e.g. "summarize_app_status" reads the whole roster).
  if (intent.scopeAppIds.length > 0) {
    const found = await prisma.appRegistry.findMany({
      where: { id: { in: intent.scopeAppIds } },
      select: { id: true },
    });
    const seen = new Set(found.map((a) => a.id));
    for (const id of intent.scopeAppIds) {
      if (!seen.has(id)) {
        errors.push({ type: "scope", details: `Unknown app id in scope: ${id}` });
      }
    }
  }
  if (intent.scopeRepoIds.length > 0) {
    const found = await prisma.gitRepository.findMany({
      where: { id: { in: intent.scopeRepoIds } },
      select: { id: true },
    });
    const seen = new Set(found.map((r) => r.id));
    for (const id of intent.scopeRepoIds) {
      if (!seen.has(id)) {
        errors.push({ type: "scope", details: `Unknown repo id in scope: ${id}` });
      }
    }
  }

  // Invariants: every capabilityKey must be in the registry, and every
  // invariantKey must be declared for that capability.
  const capabilities = listCapabilities();
  const capByKey = new Map(capabilities.map((c) => [c.key, c]));
  for (const [capKey, invariantKeys] of Object.entries(intent.invariants)) {
    if (!capByKey.has(capKey)) {
      errors.push({
        type: "invariant",
        details: `Unknown capability '${capKey}' in invariants.`,
      });
      continue;
    }
    const declared = new Set(listInvariants(capKey).map((i) => i.key));
    for (const ik of invariantKeys) {
      if (!declared.has(ik)) {
        errors.push({
          type: "invariant",
          details: `Capability '${capKey}' does not declare invariant '${ik}'.`,
        });
      }
    }
  }

  // Risk tolerance: schema enum guards the value, but a sanity belt
  // here keeps the validator self-contained.
  const tolerances = ["strict", "moderate", "permissive"];
  if (!tolerances.includes(intent.riskTolerance)) {
    errors.push({
      type: "intent",
      details: `Risk tolerance must be one of: ${tolerances.join(", ")} (got '${intent.riskTolerance}').`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/** Lightweight goal-only validator for live UI feedback. */
export function validateGoalForUi(goal: string): IntentValidationResult {
  const errors = validateGoalText(goal);
  return { valid: errors.length === 0, errors };
}
