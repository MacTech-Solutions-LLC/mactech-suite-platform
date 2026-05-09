"use client";

/**
 * IntentEditor — shared Intent declaration UI.
 *
 * Both the one-off planner (IntentBuilder) and the cron trigger form
 * (TriggerForm) declare the same Intent: goal + free-text request +
 * scope chips + per-capability invariant tree + risk tolerance. Before
 * this component existed those forms hand-rolled the same registry
 * fetch, the same chip rows, and the same invariant tree side-by-side.
 *
 * This editor owns:
 *   - registry fetch (`/api/agents/registry`)
 *   - live goal validation (`/api/agents/intent/validate`)
 *   - scope app + repo toggles
 *   - per-capability invariant checkboxes
 *   - risk-tolerance select
 *   - capability-tree affordance for `approval_required` vs `read_only`
 *
 * It does NOT own:
 *   - the surrounding submit button (caller decides label / disabled)
 *   - the schedule fields (TriggerForm only)
 *   - the templates row (different defaults per parent surface)
 *
 * Wire contract — the parent passes `value` + `onChange`. Goal text
 * lives in `value.goal`; the parent reads `value.goalValid` from the
 * derived `validity` callback.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Lock,
  Unlock,
  Loader2,
} from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export type RiskTolerance = "strict" | "moderate" | "permissive";

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

export interface IntentEditorValue {
  goal: string;
  request: string;
  scopeAppIds: Set<string>;
  scopeRepoIds: Set<string>;
  invariants: Record<string, Set<string>>;
  riskTolerance: RiskTolerance;
}

export interface IntentEditorProps {
  value: IntentEditorValue;
  onChange: (next: IntentEditorValue) => void;
  /** Surface a "show all capabilities" toggle (planner mode); off for triggers. */
  showAllCapabilitiesToggle?: boolean;
  /** Render the free-text request field above scope. Defaults to true. */
  showRequestField?: boolean;
  /** Label for the request field — surface-specific copy. */
  requestLabel?: string;
  /** Placeholder for the request field. */
  requestPlaceholder?: string;
  /** Callback fired with `(valid)` whenever live goal validation resolves. */
  onValidityChange?: (valid: boolean) => void;
  /** Called when registry fetch fails — caller surfaces in their submit error. */
  onRegistryError?: () => void;
}

/**
 * Build a fresh empty value seeded with defaults — convenient for
 * parents to use as their initial state.
 */
export function emptyIntentValue(overrides?: Partial<IntentEditorValue>): IntentEditorValue {
  return {
    goal: "",
    request: "",
    scopeAppIds: new Set(),
    scopeRepoIds: new Set(),
    invariants: {},
    riskTolerance: "strict",
    ...overrides,
  };
}

export function IntentEditor({
  value,
  onChange,
  showAllCapabilitiesToggle = false,
  showRequestField = true,
  requestLabel = "Free-text request (fed to the planner)",
  requestPlaceholder = "What should the planner do? Often the same as goal.",
  onValidityChange,
  onRegistryError,
}: IntentEditorProps) {
  const [registry, setRegistry] = useState<RegistryPayload | null>(null);
  const [loadingRegistry, setLoadingRegistry] = useState(true);
  const [goalErrors, setGoalErrors] = useState<string[]>([]);
  const [showAllCapabilities, setShowAllCapabilities] = useState(false);

  // Fetch registry once.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents/registry")
      .then((r) => r.json())
      .then((body: RegistryPayload) => {
        if (cancelled) return;
        if (!body.ok) {
          onRegistryError?.();
          return;
        }
        setRegistry(body);
        // Pre-check default-on invariants only if the parent's invariants
        // map is empty — never overwrite an explicitly-loaded edit value.
        const noInvariantsYet = Object.values(value.invariants).every(
          (s) => s.size === 0,
        );
        if (noInvariantsYet) {
          const seeded: Record<string, Set<string>> = {};
          for (const inv of body.invariants) {
            if (inv.defaultOn) {
              const set = seeded[inv.capabilityKey] ?? new Set();
              set.add(inv.key);
              seeded[inv.capabilityKey] = set;
            }
          }
          onChange({ ...value, invariants: seeded });
        }
      })
      .catch(() => {
        onRegistryError?.();
      })
      .finally(() => {
        if (!cancelled) setLoadingRegistry(false);
      });
    return () => {
      cancelled = true;
    };
    // We intentionally fire this once per mount — re-running on
    // value/onChange changes would loop the seed pre-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-validate the goal text.
  useEffect(() => {
    if (!value.goal.trim()) {
      setGoalErrors([]);
      onValidityChange?.(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/agents/intent/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: value.goal }),
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
        const errs = (body.errors ?? []).map((e) => e.details);
        setGoalErrors(errs);
        onValidityChange?.(errs.length === 0);
      } catch {
        // best-effort live validation
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.goal]);

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

  function setGoal(goal: string) {
    onChange({ ...value, goal });
  }
  function setRequest(request: string) {
    onChange({ ...value, request });
  }
  function setRiskTolerance(rt: RiskTolerance) {
    onChange({ ...value, riskTolerance: rt });
  }
  function toggleApp(id: string) {
    const next = new Set(value.scopeAppIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, scopeAppIds: next });
  }
  function toggleRepo(id: string) {
    const next = new Set(value.scopeRepoIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, scopeRepoIds: next });
  }
  function toggleInvariant(capKey: string, invKey: string) {
    const set = new Set(value.invariants[capKey] ?? []);
    if (set.has(invKey)) set.delete(invKey);
    else set.add(invKey);
    onChange({
      ...value,
      invariants: { ...value.invariants, [capKey]: set },
    });
  }

  if (loadingRegistry) {
    return (
      <div className="rounded-lg border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" aria-hidden="true" />
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

  const visibleCaps = showAllCapabilities
    ? registry.capabilities
    : registry.capabilities.filter(
        (c) => (invariantsByCap.get(c.key) ?? []).length > 0,
      );

  return (
    <div className="space-y-4">
      {/* Goal --------------------------------------------------------- */}
      <div>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Goal (must start with verb + contain measurable outcome)
          </div>
          <textarea
            rows={2}
            value={value.goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder='e.g. "Summarize every open operational risk by severity."'
            className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        {value.goal.trim().length > 0 ? (
          goalErrors.length === 0 ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-success">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              IBE goal validation: passes
            </div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {goalErrors.map((e, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1 text-xs text-warning"
                >
                  <AlertTriangle
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {/* Free-text request ------------------------------------------- */}
      {showRequestField ? (
        <div>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {requestLabel}
            </div>
            <textarea
              rows={2}
              value={value.request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder={requestPlaceholder}
              className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>
      ) : null}

      {/* Scope -------------------------------------------------------- */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Scope — apps the run may touch (empty = unbounded)
        </div>
        <div className="flex flex-wrap gap-1">
          {registry.apps.map((a) => (
            <Chip
              key={a.id}
              size="sm"
              variant="default"
              pressed={value.scopeAppIds.has(a.id)}
              onClick={() => toggleApp(a.id)}
              ariaLabel={`Scope app: ${a.name} (${a.appKey})`}
            >
              {a.name}
            </Chip>
          ))}
        </div>
        <div className="mt-2 mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Scope — repos
        </div>
        <div className="flex flex-wrap gap-1">
          {registry.repos.map((r) => (
            <Chip
              key={r.id}
              size="mono"
              variant="default"
              pressed={value.scopeRepoIds.has(r.id)}
              onClick={() => toggleRepo(r.id)}
              ariaLabel={`Scope repo: ${r.fullName}`}
            >
              {r.fullName}
            </Chip>
          ))}
        </div>
      </div>

      {/* Invariants per capability ----------------------------------- */}
      <div>
        <div className="flex items-center justify-between">
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Indicators that must hold (invariants)
          </div>
          {showAllCapabilitiesToggle ? (
            <Chip
              size="xs"
              variant="ghost"
              pressed={showAllCapabilities}
              onClick={() => setShowAllCapabilities((v) => !v)}
              ariaLabel={
                showAllCapabilities
                  ? "Show only capabilities with invariants"
                  : "Show all capabilities"
              }
            >
              {showAllCapabilities ? "show only with invariants" : "show all capabilities"}
            </Chip>
          ) : null}
        </div>
        <ul className="space-y-2">
          {visibleCaps.map((cap) => {
            const capInvs = invariantsByCap.get(cap.key) ?? [];
            if (capInvs.length === 0 && !showAllCapabilities) return null;
            const accent =
              cap.kind === "approval_required"
                ? "border-l-4 border-l-warning"
                : "border-l-4 border-l-transparent";
            return (
              <li
                key={cap.key}
                className={`rounded-md border border-border bg-background p-2 ${accent}`}
              >
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {cap.kind === "approval_required" ? (
                    <Lock
                      className="h-3 w-3 text-warning"
                      aria-hidden="true"
                    />
                  ) : (
                    <Unlock
                      className="h-3 w-3 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span className="font-medium">{cap.label}</span>
                  {cap.kind === "approval_required" ? (
                    <Badge variant="warning">approval-required</Badge>
                  ) : (
                    <Badge variant="muted">read-only</Badge>
                  )}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {cap.key}
                  </span>
                </div>
                {capInvs.length === 0 ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    No invariants declared for this capability.
                  </div>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {capInvs.map((inv) => {
                      const checked = (value.invariants[cap.key] ?? new Set()).has(
                        inv.key,
                      );
                      const id = `inv-${cap.key}-${inv.key}`;
                      return (
                        <li
                          key={inv.key}
                          className="flex items-start gap-2 text-[12px]"
                        >
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={() =>
                              toggleInvariant(cap.key, inv.key)
                            }
                            className="mt-0.5"
                          />
                          <label htmlFor={id} className="cursor-pointer">
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
                          </label>
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

      {/* Risk tolerance ---------------------------------------------- */}
      <div>
        <label className="text-xs">
          <span className="mr-1 text-muted-foreground">Risk tolerance:</span>
          <select
            value={value.riskTolerance}
            onChange={(e) => setRiskTolerance(e.target.value as RiskTolerance)}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <option value="strict">strict (refuse on any violation)</option>
            <option value="moderate">moderate</option>
            <option value="permissive">permissive (record only)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/**
 * Helper to convert the editor's `Set`-based invariants into the
 * Map<string, string[]> shape the API expects.
 */
export function serializeIntentInvariants(
  invariants: Record<string, Set<string>>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [capKey, set] of Object.entries(invariants)) {
    if (set.size > 0) out[capKey] = Array.from(set);
  }
  return out;
}
