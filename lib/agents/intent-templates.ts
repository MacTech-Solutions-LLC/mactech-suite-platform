/**
 * Starter Intent templates shared by IntentBuilder (one-off plans) and
 * TriggerForm (scheduled cron triggers). Each template carries a
 * suggested cron + timezone so click-to-apply on the trigger form fills
 * the schedule too — saving an operator from typing both.
 *
 * Adding a template is an editorial change, not a runtime concern. The
 * orchestrator does not consume this list; the planner does not see it.
 */

export interface IntentTemplate {
  /** Short label rendered as a chip. */
  label: string;
  /** Validated as the run's `intent.goal`. */
  goal: string;
  /** Free-text request fed to the planner. Often identical to goal. */
  request: string;
  /**
   * Suggested cron expression for trigger-form click-to-apply. Templates
   * without a cron suggestion (e.g. ad-hoc summaries) leave the field
   * unchanged when applied.
   */
  cron?: string;
  /** IANA timezone for the suggested cron. */
  tz?: string;
}

export const INTENT_TEMPLATES: IntentTemplate[] = [
  {
    label: "Open risks (read-only)",
    goal: "Summarize every open operational risk by severity and category.",
    request: "Summarize every open operational risk by severity and category.",
    cron: "0 6 * * *",
    tz: "UTC",
  },
  {
    label: "Deployment drift",
    goal: "List every app whose live deployment commit differs from main.",
    request: "List every app whose live deployment commit differs from main.",
    cron: "0 6 * * 1",
    tz: "UTC",
  },
  {
    label: "Failing workflow runs",
    goal: "Inspect recent workflow runs whose conclusion is failure or timed_out.",
    request: "Inspect recent workflow runs whose conclusion is failure or timed_out.",
    cron: "0 */6 * * *",
    tz: "UTC",
  },
  {
    label: "Health failures",
    goal: "Inspect apps whose latest health probe is degraded or down.",
    request: "Inspect apps whose latest health probe is degraded or down.",
    cron: "*/15 * * * *",
    tz: "UTC",
  },
  {
    label: "Recent release notes",
    goal: "List recent release-notes summaries across the ecosystem.",
    request: "List recent release-notes summaries across the ecosystem.",
    cron: "0 6 * * *",
    tz: "UTC",
  },
];
