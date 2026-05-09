/**
 * AgentOps error-copy lookup.
 *
 * The agent API surfaces machine slugs (e.g. `plan_failed`,
 * `registry_load_failed`, `cron_invalid`). The operator-facing UI
 * should render an English headline first and keep the slug as a
 * small monospace tail so it stays greppable. This module is the
 * single place where slug → English translation happens; UI sites
 * call `humanizeAgentError(slug)` and render `{ headline, slug }`.
 *
 * Adding a new slug here is a strictly UI-shaped concern — the API
 * routes still emit slugs as their stable wire contract.
 */

const KNOWN_AGENT_ERRORS: Record<string, string> = {
  // Plan + intent submission
  plan_failed: "Could not plan a run for this request.",
  request_required: "A request is required to plan a run.",
  registry_load_failed: "Could not load the agent capability + invariant catalog.",
  intent_invalid: "The declared intent did not pass IBE validation.",

  // Trigger save / edit
  save_failed: "Could not save the trigger.",
  missing_required_fields: "Fill out every required field before saving.",
  cron_invalid: "Cron expression is not valid (must be 5–7 fields).",
  trigger_not_found: "That trigger no longer exists.",

  // Trigger row actions
  fire_failed: "Could not fire the trigger right now.",
  toggle_failed: "Could not change the trigger's enabled state.",
  delete_failed: "Could not delete the trigger.",

  // Run actions
  approve_failed: "Could not record that approval decision.",
  execute_failed: "Could not start executing this plan.",
  not_authorized: "You don't have permission to perform that action.",
  self_approval_forbidden:
    "You requested this run, so a different admin must approve it (separation of duties).",
};

export interface HumanizedAgentError {
  /** Operator-readable English. Always non-empty. */
  headline: string;
  /** Original machine slug. Kept for grep, support tickets, audit trail. */
  slug: string;
}

/**
 * Translate a machine slug to a human-readable headline. Falls through
 * to a generic message when the slug is unknown so the operator never
 * sees a bare slug.
 */
export function humanizeAgentError(slug: string | null | undefined): HumanizedAgentError | null {
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!trimmed) return null;
  return {
    headline: KNOWN_AGENT_ERRORS[trimmed] ?? "Something went wrong with this action.",
    slug: trimmed,
  };
}
