"use client";

/**
 * IntentBuilder — Slice 5.5 IBE-gated plan-creation UI.
 *
 * Replaces the simple textarea PlanForm with a deliberate Intent
 * declaration: the user picks a goal (validated live against IBE
 * rules), narrows scope to specific apps + repos, opts in to
 * invariants ("indicators") per capability, and selects a risk
 * tolerance. The plan API only accepts a run if the Intent is valid;
 * the orchestrator only runs steps whose inputs stay inside the
 * declared scope; any invariant violation refuses the run.
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

const TEMPLATES: Array<{ label: string; goal: string; request: string }> = [
  {
    label: "Open risks (read-only)",
    goal: "Summarize every open operational risk by severity and category.",
    request: "Summarize every open operational risk by severity and category.",
  },
  {
    label: "Deployment drift",
    goal: "List every app whose live deployment commit differs from main.",
    request: "List every app whose live deployment commit differs from main.",
  },
  {
    label: "Failing workflow runs",
    goal: "Inspect recent workflow runs whose conclusion is failure or timed_out.",
    request: "Inspect recent workflow runs whose conclusion is failure or timed_out.",
  },
  {
    label: "Health failures",
    goal: "Inspect apps whose latest health probe is degraded or down.",
    request: "Inspect apps whose latest health probe is degraded or down.",
  },
  {
    label: "Recent release notes",
    goal: "List recent release-notes summaries across the ecosystem.",
    request: "List recent release-notes summaries across the ecosystem.",
  },
];

export function IntentBuilder() {
  const router = useRouter();
  const [registry, setRegistry] = useState<RegistryPayload | null>(null);
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  const [goal, setGoal] = useState("");
  const [request, setRequest] = useState("");
  const [scopeAppIds, setScopeAppIds] = useState<Set<string>>(new Set());
  const [scopeRepoIds, setScopeRepoIds] = useState<Set<string>>(new Set());
  const [invariants, setInvariants] = useState<Record<string, Set<string>>>({});
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>("strict");
  const [showAllCapabilities, setShowAllCapabilities] = useState(false);

  const [goalErrors, setGoalErrors] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch registry once on mount.
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
        // Pre-check default-on invariants so the user sees the floor.
        const initial: Record<string, Set<string>> = {};
        for (const inv of body.invariants) {
          if (inv.defaultOn) {
            const set = initial[inv.capabilityKey] ?? new Set();
            set.add(inv.key);
            initial[inv.capabilityKey] = set;
          }
        }
        setInvariants(initial);
      })
      .catch(() => setSubmitError("registry_load_failed"))
      .finally(() => setLoadingRegistry(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Live-validate goal text on a small debounce.
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
        if (!body.ok) {
          setGoalErrors([]);
          return;
        }
        setGoalErrors((body.errors ?? []).map((e) => e.details));
      } catch {
        // Ignore — live validation is best-effort.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [goal]);

  // Group invariants by capability for rendering.
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

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setGoal(t.goal);
    setRequest(t.request);
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
    if (!request.trim()) {
      setSubmitError("request_required");
      return;
    }
    setPlanning(true);
    setSubmitError(null);
    try {
      const intentInvariants: Record<string, string[]> = {};
      for (const [capKey, set] of Object.entries(invariants)) {
        if (set.size > 0) intentInvariants[capKey] = Array.from(set);
      }
      const r = await fetch("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request,
          intent: goal.trim()
            ? {
                goal,
                scopeAppIds: Array.from(scopeAppIds),
                scopeRepoIds: Array.from(scopeRepoIds),
                invariants: intentInvariants,
                riskTolerance,
              }
            : undefined,
        }),
      });
      const body = (await r.json()) as {
        ok: boolean;
        runId?: string;
        error?: string;
        details?: Array<{ details: string }>;
      };
      if (!r.ok || !body.ok) {
        setSubmitError(
          body.details && body.details.length > 0
            ? body.details.map((d) => d.details).join("; ")
            : (body.error ?? "plan_failed"),
        );
        return;
      }
      router.push(`/admin/agents/${body.runId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "plan_failed");
    } finally {
      setPlanning(false);
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

  // Show only "relevant" capabilities (the ones whose invariants the
  // user is most likely to care about) by default; expand to see all.
  const visibleCaps = showAllCapabilities
    ? registry.capabilities
    : registry.capabilities.filter((c) => (invariantsByCap.get(c.key) ?? []).length > 0);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Declare your intent</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Slice 5.5 IBE gates: every plan must carry a machine-checkable goal, a
        bounded scope, and a set of indicators (invariants) that must hold. A
        run that violates any declared invariant lands in <strong>refused</strong>{" "}
        instead of completed.
      </p>

      {/* Templates ----------------------------------------------------- */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Templates
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => applyTemplate(t)}
              className="rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Goal --------------------------------------------------------- */}
      <div>
        <label className="block">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Goal (must start with verb + contain measurable outcome)
          </div>
          <textarea
            rows={2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder='e.g. "Summarize every open operational risk by severity."'
            className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        {goal.trim().length > 0 ? (
          goalErrors.length === 0 ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-success">
              <ShieldCheck className="h-3 w-3" />
              IBE goal validation: passes
            </div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {goalErrors.map((e, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1 text-xs text-warning"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {/* Free-text request ------------------------------------------- */}
      <div>
        <label className="block">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Free-text request (fed to the planner)
          </div>
          <textarea
            rows={2}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="What should the planner do? Often the same as goal."
            className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      </div>

      {/* Scope -------------------------------------------------------- */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Scope — apps the run may touch (empty = unbounded)
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

      {/* Invariants per capability ----------------------------------- */}
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Indicators that must hold (invariants)
          </div>
          <button
            type="button"
            onClick={() => setShowAllCapabilities((v) => !v)}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            {showAllCapabilities ? "show only with invariants" : "show all capabilities"}
          </button>
        </div>
        <ul className="space-y-2">
          {visibleCaps.map((cap) => {
            const capInvs = invariantsByCap.get(cap.key) ?? [];
            if (capInvs.length === 0 && !showAllCapabilities) return null;
            return (
              <li
                key={cap.key}
                className="rounded-md border border-border bg-background p-2"
              >
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
                {capInvs.length === 0 ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    No invariants declared for this capability.
                  </div>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {capInvs.map((inv) => {
                      const checked = (invariants[cap.key] ?? new Set()).has(
                        inv.key,
                      );
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
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Risk tolerance + submit ------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
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

        <Button
          size="sm"
          disabled={planning || !request.trim() || (goal.trim().length > 0 && !goalValid)}
          onClick={submit}
        >
          {planning ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" />
          )}
          {planning ? "Planning…" : "Plan with this intent"}
        </Button>
        {submitError ? (
          <span className="font-mono text-[11px] text-destructive">{submitError}</span>
        ) : null}
      </div>
    </div>
  );
}
