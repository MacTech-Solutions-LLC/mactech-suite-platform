/**
 * Intent-Bound Execution types — Slice 5.5.
 *
 * Ports the doctrine from /Users/patrick/IBE into the AgentOps runtime:
 * every AgentRun carries a user-declared Intent (goal + scope +
 * invariants + risk_tolerance) that the orchestrator validates before
 * planning and again after each capability invocation. AI output is a
 * proposal; the Intent is the contract.
 */

import type { AgentRiskTolerance } from "@prisma/client";

/**
 * The user's declared Intent for a single AgentRun. Persisted on
 * AgentRun.intentGoal / intentScope* / intentInvariantsJson /
 * intentRiskTolerance, and replayed by the orchestrator at every
 * lifecycle step.
 */
export interface Intent {
  /** Goal text — IBE-validated (verb + measurable outcome, no vague words). */
  goal: string;
  /** App ids the run may touch. Empty == unbounded. */
  scopeAppIds: string[];
  /** Repository ids the run may touch. Empty == unbounded. */
  scopeRepoIds: string[];
  /**
   * Invariants the user requires, grouped by capability key:
   *   { "<capabilityKey>": ["<invariantKey>", ...] }
   * The orchestrator evaluates only invariants the user explicitly
   * checked — nothing implicit, nothing surprising.
   */
  invariants: Record<string, string[]>;
  /** Refusal aggressiveness; default `strict` for bulk actions. */
  riskTolerance: AgentRiskTolerance;
}

export interface IntentValidationError {
  type: "intent" | "scope" | "invariant" | "ambiguity";
  details: string;
}

export interface IntentValidationResult {
  valid: boolean;
  errors: IntentValidationError[];
}

/** Outcome of one invariant evaluation against a step's result. */
export interface InvariantOutcome {
  invariantKey: string;
  ok: boolean;
  /** Numeric / string / boolean value the invariant observed. */
  actual: string | number | boolean | null;
  /** Human-readable line surfaced in the UI when the invariant fails. */
  message: string;
}

/**
 * Static metadata for an invariant the user can attach to a capability
 * step. Code-defined like the capability registry — never DB-backed,
 * so no DB write can widen the agent's contract surface.
 */
export interface InvariantDefinition {
  key: string;
  /** Capability key this invariant attaches to. */
  capabilityKey: string;
  /** Short label shown in the IntentBuilder checkbox. */
  label: string;
  /** Long-form description shown on hover. */
  description: string;
  /** "guaranteed pass" invariants run by default; the user opts in to others. */
  defaultOn: boolean;
  /**
   * Evaluator: receives the step's input + the capability's CapabilityResult
   * summary, returns a structured outcome. Pure-logic only — must not call
   * the DB or external services beyond what's already in the result/input.
   */
  evaluate(
    stepInput: Record<string, unknown>,
    stepSummary: Record<string, unknown>,
  ): InvariantOutcome;
}
