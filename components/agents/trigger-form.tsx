"use client";

/**
 * TriggerForm — Slice 5.8 create/edit form for AgentTrigger.
 *
 * Reuses the IntentBuilder UX (goal + scope + invariants + tolerance)
 * with the same registry catalog endpoint, then wraps a cron schedule
 * + name on top. Submits to POST /api/agents/triggers (create) or
 * PATCH /api/agents/triggers/[id] (edit).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Target,
  Lock,
  Unlock,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface RegistryApp {
  id: string;
  appKey: string;
  name: string;
}
interface RegistryRepo {
  id: string;
  fullName: string;
}
interface RegistryCapability {
  key: string;
  kind: "read_only" | "approval_required";
  label: string;
  description: string;
  requiredInputs: string[];
  optionalInputs: string[];
}
interface RegistryInvariant {
  capabilityKey: string;
  key: string;
  label: string;
  description: string;
  defaultOn: boolean;
}
interface RegistryPayload {
  ok: boolean;
  apps: RegistryApp[];
  repos: RegistryRepo[];
  capabilities: RegistryCapability[];
  invariants: RegistryInvariant[];
}

type RiskTolerance = "strict" | "moderate" | "permissive";

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
  const [registry, setRegistry] = useState<RegistryPayload | null>(null);
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [cronExpression, setCronExpression] = useState(
    initial?.cronExpression ?? "0 6 * * *",
  );
  const [timezone, setTimezone] = useState(initial?.timezone ?? "UTC");

  const [goal, setGoal] = useState(initial?.intent.goal ?? "");
  const [request, setRequest] = useState(initial?.request ?? "");
  const [scopeAppIds, setScopeAppIds] = useState<Set<string>>(
    new Set(initial?.intent.scopeAppIds ?? []),
  );
  const [scopeRepoIds, setScopeRepoIds] = useState<Set<string>>(
    new Set(initial?.intent.scopeRepoIds ?? []),
  );
  const [invariants, setInvariants] = useState<Record<string, Set<string>>>(() => {
    const out: Record<string, Set<string>> = {};
    for (const [k, vs] of Object.entries(initial?.intent.invariants ?? {})) {
      out[k] = new Set(vs);
    }
    return out;
  });
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>(
    initial?.intent.riskTolerance ?? "strict",
  );
  const [autoExecute, setAutoExecute] = useState(initial?.autoExecute ?? true);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const [goalErrors, setGoalErrors] = useState<string[]>([]);
  const [cronPreview, setCronPreview] = useState<string | null>(null);
  const [cronError, setCronError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch registry once.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents/registry")
      .then((r) => r.json())
      .then((body: RegistryPayload) => {
        if (cancelled) return;
        if (!body.ok) {
          setSubmitError("registry_load_failed");
          return;
        }
        setRegistry(body);
        // For NEW triggers (no initial), pre-check default-on invariants.
        if (!initial) {
          const out: Record<string, Set<string>> = {};
          for (const inv of body.invariants) {
            if (inv.defaultOn) {
              const set = out[inv.capabilityKey] ?? new Set();
              set.add(inv.key);
              out[inv.capabilityKey] = set;
            }
          }
          setInvariants(out);
        }
      })
      .catch(() => setSubmitError("registry_load_failed"))
      .finally(() => setLoadingRegistry(false));
    return () => {
      cancelled = true;
    };
  }, [initial]);

  // Live-validate goal text.
  useEffect(() => {
    if (!goal.trim()) {
      setGoalErrors([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/agents/intent/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal }),
        });
        const body = (await r.json()) as {
          ok: boolean;
          valid: boolean;
          errors?: Array<{ details: string }>;
        };
        if (body.ok) {
          setGoalErrors((body.errors ?? []).map((e) => e.details));
        }
      } catch {
        // best-effort
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [goal]);

  // Live-validate cron expression by re-deriving "next fire" client-side
  // we hit the same parser via a lightweight internal endpoint? Simpler:
  // do a syntactic sanity check here, server validates again on submit.
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

  const invariantsByCap = useMemo(() => {
    const map = new Map<string, RegistryInvariant[]>();
    if (!registry) return map;
    for (const inv of registry.invariants) {
      const list = map.get(inv.capabilityKey) ?? [];
      list.push(inv);
      map.set(inv.capabilityKey, list);
    }
    return map;
  }, [registry]);

  function applyPreset(p: (typeof CRON_PRESETS)[number]) {
    setCronExpression(p.expr);
    setTimezone(p.tz);
  }
  function toggleApp(id: string) {
    setScopeAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleRepo(id: string) {
    setScopeRepoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleInvariant(capKey: string, invKey: string) {
    setInvariants((prev) => {
      const next = { ...prev };
      const set = new Set(next[capKey] ?? []);
      if (set.has(invKey)) set.delete(invKey);
      else set.add(invKey);
      next[capKey] = set;
      return next;
    });
  }

  async function submit() {
    if (!name.trim() || !request.trim() || !goal.trim() || !cronExpression.trim()) {
      setSubmitError("missing_required_fields");
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      const intentInvariants: Record<string, string[]> = {};
      for (const [capKey, set] of Object.entries(invariants)) {
        if (set.size > 0) intentInvariants[capKey] = Array.from(set);
      }
      const payload = {
        name,
        description: description || undefined,
        cronExpression,
        timezone,
        request,
        autoExecute,
        enabled,
        intent: {
          goal,
          scopeAppIds: Array.from(scopeAppIds),
          scopeRepoIds: Array.from(scopeRepoIds),
          invariants: intentInvariants,
          riskTolerance,
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

  if (loadingRegistry) {
    return (
      <div className="rounded-lg border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
        Loading capability + invariant catalog…
      </div>
    );
  }

  if (!registry) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Failed to load the agent registry. Reload the page.
      </div>
    );
  }

  const goalValid = goal.trim().length > 0 && goalErrors.length === 0;

  return (
    <div className="space-y-4">
      {/* Trigger metadata */}
      <div className="space-y-3 rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Schedule</div>
        </div>

        <label className="block">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
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
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
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
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Presets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <label className="block">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
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
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
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
          <div className="text-xs text-warning flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {cronError}
          </div>
        ) : cronPreview ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-success" />
            <span className="font-mono">{cronPreview}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Enabled</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={autoExecute}
              onChange={(e) => setAutoExecute(e.target.checked)}
            />
            <span>Auto-execute (read-only plans only)</span>
          </label>
        </div>
      </div>

      {/* Intent declaration — same UX as IntentBuilder, condensed */}
      <div className="space-y-4 rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Declared intent (saved with this trigger)</div>
        </div>

        <label className="block">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Goal (verb + measurable outcome)
          </div>
          <textarea
            rows={2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder='e.g. "Summarize every open operational risk by severity."'
            className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        {goal.trim() ? (
          goalErrors.length === 0 ? (
            <div className="flex items-center gap-1 text-xs text-success">
              <ShieldCheck className="h-3 w-3" />
              IBE goal validation: passes
            </div>
          ) : (
            <ul className="space-y-0.5">
              {goalErrors.map((e, i) => (
                <li key={i} className="flex items-start gap-1 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}

        <label className="block">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Free-text request (fed to the planner each fire)
          </div>
          <textarea
            rows={2}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Often the same as goal."
            className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Scope — apps (empty = unbounded)
          </div>
          <div className="flex flex-wrap gap-1">
            {registry.apps.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleApp(a.id)}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  scopeAppIds.has(a.id)
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
                }`}
                title={a.appKey}
              >
                {a.name}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Scope — repos
          </div>
          <div className="flex flex-wrap gap-1">
            {registry.repos.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRepo(r.id)}
                className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  scopeRepoIds.has(r.id)
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
                }`}
              >
                {r.fullName}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Indicators (invariants that must hold)
          </div>
          <ul className="space-y-2">
            {registry.capabilities
              .filter((c) => (invariantsByCap.get(c.key) ?? []).length > 0)
              .map((cap) => {
                const capInvs = invariantsByCap.get(cap.key) ?? [];
                return (
                  <li key={cap.key} className="rounded-md border border-border bg-background p-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      {cap.kind === "approval_required" ? (
                        <Lock className="h-3 w-3 text-warning" />
                      ) : (
                        <Unlock className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="font-medium">{cap.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {cap.key}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {capInvs.map((inv) => {
                        const checked = (invariants[cap.key] ?? new Set()).has(inv.key);
                        return (
                          <li key={inv.key} className="flex items-start gap-2 text-[12px]">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleInvariant(cap.key, inv.key)}
                              className="mt-0.5"
                            />
                            <div>
                              <div>
                                {inv.label}
                                {inv.defaultOn ? (
                                  <span className="ml-1.5 text-[9px] uppercase tracking-widest text-muted-foreground">
                                    default-on
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {inv.description}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
          </ul>
        </div>

        <label className="text-xs">
          <span className="mr-1 text-muted-foreground">Risk tolerance:</span>
          <select
            value={riskTolerance}
            onChange={(e) => setRiskTolerance(e.target.value as RiskTolerance)}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
          >
            <option value="strict">strict (refuse on any violation)</option>
            <option value="moderate">moderate</option>
            <option value="permissive">permissive (record only)</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={
            saving || Boolean(cronError) || !name.trim() || !request.trim() || !goalValid
          }
          onClick={submit}
        >
          {saving ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" />
          )}
          {saving ? "Saving…" : initial ? "Save changes" : "Create trigger"}
        </Button>
        {submitError ? (
          <span className="font-mono text-[11px] text-destructive">{submitError}</span>
        ) : null}
      </div>
    </div>
  );
}
