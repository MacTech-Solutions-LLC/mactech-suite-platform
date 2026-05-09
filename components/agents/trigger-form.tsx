"use client";

/**
 * TriggerForm — Slice 5.8 create/edit form for AgentTrigger.
 *
 * Shape: schedule fields (name, cron, tz, flags) + the shared
 * <IntentEditor>. The Intent half of this form is identical to the
 * IntentBuilder — both render through the same component so they cannot
 * drift. New in this revision: a Templates row that fills BOTH the
 * Intent body AND the cron preset, since "save my common intent on a
 * schedule" is the primary use case.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  Target,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import {
  IntentEditor,
  emptyIntentValue,
  serializeIntentInvariants,
  type IntentEditorValue,
  type RiskTolerance,
} from "@/components/agents/intent-editor";
import { INTENT_TEMPLATES, type IntentTemplate } from "@/lib/agents/intent-templates";
import { humanizeAgentError } from "@/lib/agents/error-copy";

const CRON_PRESETS: Array<{ label: string; expr: string; tz: string }> = [
  { label: "every minute", expr: "* * * * *", tz: "UTC" },
  { label: "every 15 minutes", expr: "*/15 * * * *", tz: "UTC" },
  { label: "every hour", expr: "0 * * * *", tz: "UTC" },
  { label: "every 6 hours", expr: "0 */6 * * *", tz: "UTC" },
  { label: "daily 06:00 UTC", expr: "0 6 * * *", tz: "UTC" },
  { label: "daily 06:00 ET", expr: "0 6 * * *", tz: "America/New_York" },
  { label: "weekly Mon 06:00 UTC", expr: "0 6 * * 1", tz: "UTC" },
];

export interface TriggerFormProps {
  /** When present, this is an edit; otherwise create. */
  initial?: {
    id: string;
    name: string;
    description: string | null;
    cronExpression: string;
    timezone: string;
    request: string;
    intent: {
      goal: string;
      scopeAppIds: string[];
      scopeRepoIds: string[];
      invariants: Record<string, string[]>;
      riskTolerance: RiskTolerance;
    };
    autoExecute: boolean;
    enabled: boolean;
  };
}

export function TriggerForm({ initial }: TriggerFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [cronExpression, setCronExpression] = useState(
    initial?.cronExpression ?? "0 6 * * *",
  );
  const [timezone, setTimezone] = useState(initial?.timezone ?? "UTC");
  const [autoExecute, setAutoExecute] = useState(initial?.autoExecute ?? true);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  // Intent state — flow through the shared editor.
  const [intent, setIntent] = useState<IntentEditorValue>(() => {
    if (!initial) return emptyIntentValue();
    const invariants: Record<string, Set<string>> = {};
    for (const [k, vs] of Object.entries(initial.intent.invariants ?? {})) {
      invariants[k] = new Set(vs);
    }
    return {
      goal: initial.intent.goal,
      request: initial.request,
      scopeAppIds: new Set(initial.intent.scopeAppIds),
      scopeRepoIds: new Set(initial.intent.scopeRepoIds),
      invariants,
      riskTolerance: initial.intent.riskTolerance,
    };
  });
  const [goalValid, setGoalValid] = useState(false);

  const [cronPreview, setCronPreview] = useState<string | null>(null);
  const [cronError, setCronError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Live cron syntax sanity check (server validates again on submit).
  useEffect(() => {
    const trimmed = cronExpression.trim();
    if (!trimmed) {
      setCronPreview(null);
      setCronError(null);
      return;
    }
    const fields = trimmed.split(/\s+/);
    if (fields.length < 5 || fields.length > 7) {
      setCronPreview(null);
      setCronError(`Cron must have 5–7 fields; got ${fields.length}.`);
    } else {
      setCronError(null);
      setCronPreview(`${trimmed} (${timezone})`);
    }
  }, [cronExpression, timezone]);

  function applyPreset(p: (typeof CRON_PRESETS)[number]) {
    setCronExpression(p.expr);
    setTimezone(p.tz);
  }

  function applyTemplate(t: IntentTemplate) {
    // Apply to Intent half.
    setIntent((prev) => ({ ...prev, goal: t.goal, request: t.request }));
    // Optionally seed the schedule too — primary trigger use case.
    if (t.cron) setCronExpression(t.cron);
    if (t.tz) setTimezone(t.tz);
    // Seed the trigger name if the operator hasn't typed one yet, so
    // the form is closer to "ready to submit" after one click.
    if (!name.trim()) setName(t.label);
  }

  async function submit() {
    if (
      !name.trim() ||
      !intent.request.trim() ||
      !intent.goal.trim() ||
      !cronExpression.trim()
    ) {
      setSubmitError("missing_required_fields");
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      const payload = {
        name,
        description: description || undefined,
        cronExpression,
        timezone,
        request: intent.request,
        autoExecute,
        enabled,
        intent: {
          goal: intent.goal,
          scopeAppIds: Array.from(intent.scopeAppIds),
          scopeRepoIds: Array.from(intent.scopeRepoIds),
          invariants: serializeIntentInvariants(intent.invariants),
          riskTolerance: intent.riskTolerance,
        },
      };
      const url = initial
        ? `/api/agents/triggers/${initial.id}`
        : "/api/agents/triggers";
      const method = initial ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await r.json()) as {
        ok: boolean;
        trigger?: { id: string };
        error?: string;
        message?: string;
      };
      if (!r.ok || !body.ok) {
        setSubmitError(body.message ?? body.error ?? "save_failed");
        return;
      }
      router.push("/admin/agents/triggers");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "save_failed");
    } finally {
      setSaving(false);
    }
  }

  const errorCopy = humanizeAgentError(submitError);

  // Fine-grained "what's missing" for the disabled submit. Operators get
  // a one-line answer to "why can't I save?" without scanning the form.
  const missing: string[] = [];
  if (!name.trim()) missing.push("trigger name");
  if (!intent.goal.trim() || !goalValid) missing.push("valid goal");
  if (!intent.request.trim()) missing.push("request text");
  if (cronError) missing.push("valid cron expression");

  return (
    <div className="space-y-4">
      {/* Schedule ---------------------------------------------------- */}
      <div className="space-y-3 rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          <div className="text-sm font-semibold">Schedule</div>
        </div>

        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Trigger name
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. "Nightly ecosystem sweep"'
            className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Description (optional)
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Presets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((p) => (
              <Chip
                key={p.label}
                size="sm"
                variant="ghost"
                pressed={cronExpression === p.expr && timezone === p.tz}
                onClick={() => applyPreset(p)}
                ariaLabel={`Apply cron preset: ${p.label}`}
              >
                {p.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Cron expression
            </div>
            <input
              type="text"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="0 6 * * *"
              className="w-full rounded-md border border-border bg-background p-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Timezone (IANA)
            </div>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-md border border-border bg-background p-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>
        {cronError ? (
          <div className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {cronError}
          </div>
        ) : cronPreview ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2
              className="h-3 w-3 text-success"
              aria-hidden="true"
            />
            <span className="font-mono">{cronPreview}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label htmlFor="trigger-enabled" className="flex cursor-pointer items-center gap-1.5 text-xs">
            <Checkbox
              id="trigger-enabled"
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
            />
            <span>Enabled</span>
          </label>
          <label htmlFor="trigger-auto-execute" className="flex cursor-pointer items-center gap-1.5 text-xs">
            <Checkbox
              id="trigger-auto-execute"
              checked={autoExecute}
              onCheckedChange={(v) => setAutoExecute(v === true)}
            />
            <span>Auto-execute (read-only plans only)</span>
          </label>
        </div>
      </div>

      {/* Intent ------------------------------------------------------ */}
      <div className="space-y-4 rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" aria-hidden="true" />
          <div className="text-sm font-semibold">
            Declared intent (saved with this trigger)
          </div>
        </div>

        {/* Templates — Trigger-form variant fills cron too. */}
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Templates
          </div>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Click a template to fill the goal, request, and a suggested cron
            schedule.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {INTENT_TEMPLATES.map((t) => (
              <Chip
                key={t.label}
                size="sm"
                variant="ghost"
                onClick={() => applyTemplate(t)}
                ariaLabel={`Apply template: ${t.label}`}
              >
                {t.label}
                {t.cron ? (
                  <span className="ml-1 font-mono text-[9px] opacity-70">
                    {t.cron}
                  </span>
                ) : null}
              </Chip>
            ))}
          </div>
        </div>

        <IntentEditor
          value={intent}
          onChange={setIntent}
          requestLabel="Free-text request (fed to the planner each fire)"
          requestPlaceholder="Often the same as goal."
          onValidityChange={setGoalValid}
          onRegistryError={() => setSubmitError("registry_load_failed")}
        />
      </div>

      {/* Submit ------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={
            saving || Boolean(cronError) || !name.trim() || !intent.request.trim() || !goalValid
          }
          onClick={submit}
        >
          {saving ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
          )}
          {saving ? "Saving…" : initial ? "Save changes" : "Create trigger"}
        </Button>
        {missing.length > 0 && !saving ? (
          <span className="text-xs text-muted-foreground">
            Still needed: {missing.join(", ")}.
          </span>
        ) : null}
        {errorCopy ? (
          <span role="alert" className="text-xs text-destructive">
            {errorCopy.headline}{" "}
            <span className="ml-1 font-mono text-[10px] opacity-70">
              ({errorCopy.slug})
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
