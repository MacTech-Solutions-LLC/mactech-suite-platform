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
  // ── Slice 8: AI-summarize + email-the-team templates ──────────────
  {
    label: "Email weekly commit digest",
    goal: "Generate a weekly engineering digest of the most active repositories and commits.",
    request:
      "Use ai_summarize_dashboard with contextKey=commit_intelligence to generate a weekly engineering digest, then use email_team_summary to send it to the team. Prompt: 'Draft a weekly engineering update for leadership covering the top commits, repos that shipped the most, and any security-flagged changes.'",
    cron: "0 14 * * 1",
    tz: "UTC",
  },
  {
    label: "Email daily risk briefing",
    goal: "Email a daily briefing of open operational risks ranked by severity to leadership.",
    request:
      "Use email_team_summary with contextKey=open_risks to send a morning risk briefing. Prompt: 'Group the open risks by app and call out which one needs attention first today.'",
    cron: "0 12 * * *",
    tz: "UTC",
  },
  {
    label: "Email deployment drift alert",
    goal: "Email the team when any app drifts more than ten commits behind main.",
    request:
      "Use email_team_summary with contextKey=deployment_drift to alert the team. Prompt: 'Are any apps drifting more than 10 commits behind main? If so, name them and recommend the next move.'",
    cron: "0 */4 * * *",
    tz: "UTC",
  },
  {
    label: "Email weekly ecosystem narrative",
    goal: "Send a weekly ecosystem-health narrative covering active apps and dependencies.",
    request:
      "Use email_team_summary with contextKey=ecosystem to brief leadership on overall posture. Prompt: 'Walk the dependency graph from identity-command-center outward and explain blast radius. Note any apps that look fragile right now.'",
    cron: "0 14 * * 5",
    tz: "UTC",
  },
];
