/**
 * Invariant registry — Slice 5.5.
 *
 * Code-defined, like the capability registry. Each invariant is bound
 * to one capabilityKey and evaluates the capability's CapabilityResult
 * summary after invocation. Invariants are pure-logic only (no DB
 * lookups, no external calls) — they observe what the capability
 * produced and answer "did the contract hold?".
 *
 * Pure-logic is intentional: it makes the invariant suite trivially
 * portable to a future shadow-execution mode (à la IBE's baseline-vs-
 * patched compare), and keeps the post-execution gate fast enough to
 * run on every step without spiking latency.
 */

import type { InvariantDefinition, InvariantOutcome } from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function pass(key: string, actual: string | number | boolean | null, message: string): InvariantOutcome {
  return { invariantKey: key, ok: true, actual, message };
}
function fail(key: string, actual: string | number | boolean | null, message: string): InvariantOutcome {
  return { invariantKey: key, ok: false, actual, message };
}

// ───────────────────────────────────────────────────────────────────────────
// Read-only capability invariants
// ───────────────────────────────────────────────────────────────────────────

const summarize_open_risks_count_non_negative: InvariantDefinition = {
  key: "count_non_negative",
  capabilityKey: "summarize_open_risks",
  label: "Open-risk count is non-negative",
  description: "Sanity check: the capability returned an integer count >= 0.",
  defaultOn: true,
  evaluate(_input, summary) {
    const count = Number(summary.count);
    if (!Number.isFinite(count) || count < 0) {
      return fail("count_non_negative", count, `count was ${summary.count}`);
    }
    return pass("count_non_negative", count, `count = ${count}`);
  },
};

const summarize_open_risks_no_critical_unack: InvariantDefinition = {
  key: "no_critical_present",
  capabilityKey: "summarize_open_risks",
  label: "No critical-severity risks open",
  description:
    "Refuses the run if the open-risk feed currently lists any critical-severity flag. Pair with strict tolerance to escalate immediately.",
  defaultOn: false,
  evaluate(_input, summary) {
    const bySev = (summary.bySeverity ?? {}) as Record<string, number>;
    const critical = Number(bySev.critical ?? 0);
    if (critical > 0) {
      return fail("no_critical_present", critical, `${critical} critical-severity flag(s) open`);
    }
    return pass("no_critical_present", critical, "no critical flags open");
  },
};

const summarize_app_status_all_known: InvariantDefinition = {
  key: "all_apps_known",
  capabilityKey: "summarize_app_status",
  label: "Every app reported a known status",
  description:
    "Refuses if any app's latest health snapshot is `unknown` — surfaces stale probes.",
  defaultOn: false,
  evaluate(_input, summary) {
    const unknown = Number(summary.unknown ?? 0);
    if (unknown > 0) return fail("all_apps_known", unknown, `${unknown} app(s) with unknown health`);
    return pass("all_apps_known", unknown, "every app has a known status");
  },
};

const summarize_deployment_drift_zero_drift: InvariantDefinition = {
  key: "zero_drift",
  capabilityKey: "summarize_deployment_drift",
  label: "Zero apps in deployment drift",
  description: "Refuses if any active deployment differs from main.",
  defaultOn: false,
  evaluate(_input, summary) {
    const drift = Number(summary.drift ?? 0);
    if (drift > 0) return fail("zero_drift", drift, `${drift} app(s) drifted from main`);
    return pass("zero_drift", drift, "all apps in sync");
  },
};

const summarize_repo_activity_has_activity: InvariantDefinition = {
  key: "has_activity",
  capabilityKey: "summarize_repo_activity",
  label: "At least one commit OR workflow run found",
  description:
    "Refuses on a totally silent window — useful as a freshness check.",
  defaultOn: false,
  evaluate(_input, summary) {
    const c = Number(summary.commits ?? 0);
    const r = Number(summary.workflowRuns ?? 0);
    if (c + r === 0) return fail("has_activity", 0, "no commits or workflow runs in range");
    return pass("has_activity", c + r, `${c} commit(s), ${r} workflow run(s)`);
  },
};

const inspect_failed_workflows_zero: InvariantDefinition = {
  key: "zero_failing",
  capabilityKey: "inspect_failed_workflows",
  label: "No failing workflow runs",
  description: "Refuses if the failure feed has any rows.",
  defaultOn: false,
  evaluate(_input, summary) {
    const c = Number(summary.count ?? 0);
    if (c > 0) return fail("zero_failing", c, `${c} failing workflow run(s)`);
    return pass("zero_failing", c, "no failing runs");
  },
};

const inspect_failed_deployments_zero: InvariantDefinition = {
  key: "zero_failing_deployments",
  capabilityKey: "inspect_failed_deployments",
  label: "No failing deployments",
  description: "Refuses if any DeploymentSnapshot is in failed/crashed state.",
  defaultOn: false,
  evaluate(_input, summary) {
    const c = Number(summary.count ?? 0);
    if (c > 0) return fail("zero_failing_deployments", c, `${c} failing deployment(s)`);
    return pass("zero_failing_deployments", c, "no failing deployments");
  },
};

const inspect_health_failures_zero: InvariantDefinition = {
  key: "zero_health_failures",
  capabilityKey: "inspect_health_failures",
  label: "No health probes failing",
  description: "Refuses if any latest health probe is degraded or down.",
  defaultOn: false,
  evaluate(_input, summary) {
    const f = Number(summary.failing ?? 0);
    if (f > 0) return fail("zero_health_failures", f, `${f} app(s) failing health`);
    return pass("zero_health_failures", f, "every app healthy");
  },
};

const read_ecosystem_graph_has_nodes: InvariantDefinition = {
  key: "graph_non_empty",
  capabilityKey: "read_ecosystem_graph",
  label: "Ecosystem graph has at least one node",
  description: "Sanity: the graph render call returned ≥1 app.",
  defaultOn: true,
  evaluate(_input, summary) {
    const n = Number(summary.nodes ?? 0);
    if (n <= 0) return fail("graph_non_empty", n, "graph reported zero nodes");
    return pass("graph_non_empty", n, `${n} node(s)`);
  },
};

const summarize_recent_release_notes_count_non_negative: InvariantDefinition = {
  key: "count_non_negative",
  capabilityKey: "summarize_recent_release_notes",
  label: "Release-note count is non-negative",
  description: "Sanity check.",
  defaultOn: true,
  evaluate(_input, summary) {
    const c = Number(summary.count ?? -1);
    if (c < 0) return fail("count_non_negative", c, `count = ${c}`);
    return pass("count_non_negative", c, `count = ${c}`);
  },
};

const list_repositories_count_non_negative: InvariantDefinition = {
  key: "count_non_negative",
  capabilityKey: "list_repositories",
  label: "Repository count is non-negative",
  description: "Sanity check.",
  defaultOn: true,
  evaluate(_input, summary) {
    const c = Number(summary.count ?? -1);
    if (c < 0) return fail("count_non_negative", c, `count = ${c}`);
    return pass("count_non_negative", c, `count = ${c}`);
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Approval-required capability invariants — these have real teeth.
// ───────────────────────────────────────────────────────────────────────────

const generate_release_notes_summary_id_returned: InvariantDefinition = {
  key: "summary_id_returned",
  capabilityKey: "generate_release_notes",
  label: "CommitSummary row was created",
  description: "The capability must return a non-null commitSummaryId.",
  defaultOn: true,
  evaluate(_input, summary) {
    const id = summary.commitSummaryId;
    if (!id || typeof id !== "string") {
      return fail("summary_id_returned", null, "no commitSummaryId returned");
    }
    return pass("summary_id_returned", id, `summary id = ${id}`);
  },
};

const acknowledge_risk_flag_status_acknowledged: InvariantDefinition = {
  key: "status_now_acknowledged",
  capabilityKey: "acknowledge_risk_flag",
  label: "Target risk now reports status=acknowledged",
  description:
    "Confirms the OperationalRiskFlag's status was actually flipped (not just an idempotent no-op on a stale row).",
  defaultOn: true,
  evaluate(_input, summary) {
    if (summary.ok !== true) {
      return fail("status_now_acknowledged", false, `capability returned ok=${summary.ok}`);
    }
    if (summary.status !== "acknowledged") {
      return fail(
        "status_now_acknowledged",
        String(summary.status ?? "null"),
        `risk status = ${summary.status} after capability`,
      );
    }
    return pass("status_now_acknowledged", true, "status flipped to acknowledged");
  },
};

const trigger_repo_sync_inserted_or_zero: InvariantDefinition = {
  key: "sync_emitted_count",
  capabilityKey: "trigger_repo_sync",
  label: "Sync reported a non-negative ingest count",
  description:
    "Sanity check on the GitHub sync return value (commitsInserted + workflowRunsUpserted).",
  defaultOn: true,
  evaluate(_input, summary) {
    const c = Number(summary.commitsInserted ?? 0);
    const w = Number(summary.workflowRunsUpserted ?? 0);
    if (c < 0 || w < 0) {
      return fail("sync_emitted_count", c + w, "negative count returned");
    }
    return pass("sync_emitted_count", c + w, `${c} commit(s), ${w} workflow run(s)`);
  },
};

const trigger_railway_sync_snapshot_id: InvariantDefinition = {
  key: "snapshot_id_or_warnings",
  capabilityKey: "trigger_railway_sync",
  label: "Sync produced a snapshot OR surfaced warnings",
  description:
    "A successful Railway sync either ingests a DeploymentSnapshot id or returns warnings explaining why not (e.g. service has zero deployments).",
  defaultOn: true,
  evaluate(_input, summary) {
    const id = summary.snapshotId;
    const warnings = summary.warnings as unknown[] | undefined;
    if (id) return pass("snapshot_id_or_warnings", String(id), `snapshot id = ${id}`);
    if (Array.isArray(warnings) && warnings.length > 0) {
      return pass(
        "snapshot_id_or_warnings",
        warnings.length,
        `no snapshot, ${warnings.length} warning(s) reported`,
      );
    }
    return fail("snapshot_id_or_warnings", null, "no snapshot id and no warnings");
  },
};

const trigger_reconciliation_no_new_critical: InvariantDefinition = {
  key: "no_new_critical_opened",
  capabilityKey: "trigger_reconciliation",
  label: "Reconciliation did not open any new critical-severity flags",
  description:
    "If reconciliation opened critical risks, the run is refused so the operator stops and triages.",
  defaultOn: false,
  evaluate(_input, summary) {
    const opened = Number(summary.opened ?? 0);
    // The capability summary only carries counts; without per-flag
    // severity we approximate "any new flags" as the gating signal.
    // Stricter mode for a future pass would join through the
    // OperationalRiskFlag rows by run timestamp.
    if (opened > 0) {
      return fail("no_new_critical_opened", opened, `${opened} new flag(s) opened`);
    }
    return pass("no_new_critical_opened", 0, "no new flags opened");
  },
};

const trigger_reconciliation_resolved_non_negative: InvariantDefinition = {
  key: "resolved_non_negative",
  capabilityKey: "trigger_reconciliation",
  label: "Resolved-flag count is non-negative",
  description: "Sanity check.",
  defaultOn: true,
  evaluate(_input, summary) {
    const r = Number(summary.resolved ?? 0);
    if (r < 0) return fail("resolved_non_negative", r, `resolved = ${r}`);
    return pass("resolved_non_negative", r, `resolved = ${r}`);
  },
};

const create_github_issue_number_returned: InvariantDefinition = {
  key: "issue_number_returned",
  capabilityKey: "create_github_issue",
  label: "GitHub returned an issue number",
  description: "Confirms the issue creation actually landed (issueNumber > 0).",
  defaultOn: true,
  evaluate(_input, summary) {
    if (summary.ok !== true) {
      return fail("issue_number_returned", false, `capability returned ok=${summary.ok}`);
    }
    const n = Number(summary.issueNumber ?? 0);
    if (n <= 0) return fail("issue_number_returned", n, "no issue number returned");
    return pass("issue_number_returned", n, `issue #${n}`);
  },
};

const create_github_issue_url_present: InvariantDefinition = {
  key: "issue_url_returned",
  capabilityKey: "create_github_issue",
  label: "Issue URL is a github.com URL",
  description: "Confirms the API returned a real GitHub URL, not a stub.",
  defaultOn: true,
  evaluate(_input, summary) {
    const url = String(summary.htmlUrl ?? "");
    if (!url.startsWith("https://github.com/")) {
      return fail("issue_url_returned", url, "URL is not a github.com URL");
    }
    return pass("issue_url_returned", url, url);
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Slice 8: AI ask + email capability invariants
// ───────────────────────────────────────────────────────────────────────────

const ai_summarize_dashboard_llm_available: InvariantDefinition = {
  key: "llm_actually_ran",
  capabilityKey: "ai_summarize_dashboard",
  label: "LLM actually generated the answer (no deterministic fallback)",
  description:
    "Refuses if OPENAI_API_KEY isn't set or the call failed and the service fell back to deterministic copy. Useful when the trigger is supposed to produce a real summary, not a placeholder.",
  defaultOn: false,
  evaluate(_input, summary) {
    if (summary.llmAvailable !== true) {
      return fail("llm_actually_ran", false, "fell back to deterministic answer");
    }
    return pass("llm_actually_ran", true, "real LLM answer");
  },
};

const ai_summarize_dashboard_answer_present: InvariantDefinition = {
  key: "answer_present",
  capabilityKey: "ai_summarize_dashboard",
  label: "Answer is non-empty",
  description: "Sanity check: the AI returned at least 50 chars.",
  defaultOn: true,
  evaluate(_input, summary) {
    const len = Number(summary.answerLength ?? 0);
    if (len < 50) return fail("answer_present", len, `answer was only ${len} chars`);
    return pass("answer_present", len, `${len} chars`);
  },
};

const email_team_summary_actually_sent: InvariantDefinition = {
  key: "email_actually_sent",
  capabilityKey: "email_team_summary",
  label: "Email actually delivered to Resend",
  description:
    "Refuses if RESEND_API_KEY is missing or the Resend call failed. Important for compliance: a scheduled trigger that's supposed to email leadership should refuse silently-skipping.",
  defaultOn: true,
  evaluate(_input, summary) {
    if (summary.emailSent !== true) {
      const reason = String(summary.skippedReason ?? "send failed");
      return fail("email_actually_sent", false, `email not sent: ${reason}`);
    }
    return pass("email_actually_sent", true, `delivered to ${summary.recipients} recipients`);
  },
};

const email_team_summary_recipients_set: InvariantDefinition = {
  key: "recipients_set",
  capabilityKey: "email_team_summary",
  label: "At least one recipient",
  description: "Sanity check: the configured recipient list resolved to ≥1 email.",
  defaultOn: true,
  evaluate(_input, summary) {
    const n = Number(summary.recipients ?? 0);
    if (n < 1) return fail("recipients_set", n, "no recipients");
    return pass("recipients_set", n, `${n} recipient(s)`);
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Registry exports
// ───────────────────────────────────────────────────────────────────────────

const ALL: InvariantDefinition[] = [
  summarize_open_risks_count_non_negative,
  summarize_open_risks_no_critical_unack,
  summarize_app_status_all_known,
  summarize_deployment_drift_zero_drift,
  summarize_repo_activity_has_activity,
  inspect_failed_workflows_zero,
  inspect_failed_deployments_zero,
  inspect_health_failures_zero,
  read_ecosystem_graph_has_nodes,
  summarize_recent_release_notes_count_non_negative,
  list_repositories_count_non_negative,
  generate_release_notes_summary_id_returned,
  acknowledge_risk_flag_status_acknowledged,
  trigger_repo_sync_inserted_or_zero,
  trigger_railway_sync_snapshot_id,
  trigger_reconciliation_no_new_critical,
  trigger_reconciliation_resolved_non_negative,
  create_github_issue_number_returned,
  create_github_issue_url_present,
  ai_summarize_dashboard_llm_available,
  ai_summarize_dashboard_answer_present,
  email_team_summary_actually_sent,
  email_team_summary_recipients_set,
];

const BY_CAPABILITY = new Map<string, InvariantDefinition[]>();
for (const inv of ALL) {
  const list = BY_CAPABILITY.get(inv.capabilityKey) ?? [];
  list.push(inv);
  BY_CAPABILITY.set(inv.capabilityKey, list);
}

export function listInvariants(capabilityKey: string): readonly InvariantDefinition[] {
  return BY_CAPABILITY.get(capabilityKey) ?? [];
}

export function getInvariant(
  capabilityKey: string,
  invariantKey: string,
): InvariantDefinition | null {
  return (BY_CAPABILITY.get(capabilityKey) ?? []).find((i) => i.key === invariantKey) ?? null;
}

/** All invariants flat — for the IntentBuilder UI to enumerate. */
export function listAllInvariants(): readonly InvariantDefinition[] {
  return ALL;
}

/** Default-on invariant keys for one capability. */
export function defaultInvariantKeys(capabilityKey: string): string[] {
  return (BY_CAPABILITY.get(capabilityKey) ?? [])
    .filter((i) => i.defaultOn)
    .map((i) => i.key);
}
