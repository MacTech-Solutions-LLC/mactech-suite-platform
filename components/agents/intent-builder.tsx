"use client";

/**
 * IntentBuilder — Slice 5.5 IBE-gated plan-creation UI.
 *
 * Thin wrapper around <IntentEditor>. Adds the templates row, the
 * surface-level "Plan with this intent" submit, and dispatches to the
 * /api/agents/plan endpoint. The editor itself owns registry fetch,
 * goal validation, scope chips, invariant tree, and risk tolerance —
 * it is shared with TriggerForm so the two surfaces don't drift.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  IntentEditor,
  emptyIntentValue,
  serializeIntentInvariants,
  type IntentEditorValue,
} from "@/components/agents/intent-editor";
import { INTENT_TEMPLATES, type IntentTemplate } from "@/lib/agents/intent-templates";
import { humanizeAgentError } from "@/lib/agents/error-copy";

export function IntentBuilder() {
  const router = useRouter();
  const [intent, setIntent] = useState<IntentEditorValue>(emptyIntentValue());
  const [goalValid, setGoalValid] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function applyTemplate(t: IntentTemplate) {
    setIntent((prev) => ({ ...prev, goal: t.goal, request: t.request }));
  }

  async function submit() {
    if (!intent.request.trim()) {
      setSubmitError("request_required");
      return;
    }
    setPlanning(true);
    setSubmitError(null);
    try {
      const r = await fetch("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: intent.request,
          intent: intent.goal.trim()
            ? {
                goal: intent.goal,
                scopeAppIds: Array.from(intent.scopeAppIds),
                scopeRepoIds: Array.from(intent.scopeRepoIds),
                invariants: serializeIntentInvariants(intent.invariants),
                riskTolerance: intent.riskTolerance,
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

  const goalEntered = intent.goal.trim().length > 0;
  const planDisabled =
    planning || !intent.request.trim() || (goalEntered && !goalValid);

  const errorCopy = humanizeAgentError(submitError);

  return (
    <div
      id="intent-builder"
      className="space-y-4 rounded-lg border border-border bg-card/40 p-4"
    >
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" aria-hidden="true" />
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
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Templates
        </div>
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
            </Chip>
          ))}
        </div>
      </div>

      <IntentEditor
        value={intent}
        onChange={setIntent}
        showAllCapabilitiesToggle
        onValidityChange={setGoalValid}
        onRegistryError={() => setSubmitError("registry_load_failed")}
      />

      {/* Submit ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={planDisabled} onClick={submit}>
          {planning ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
          )}
          {planning ? "Planning…" : "Plan with this intent"}
        </Button>
        {errorCopy ? (
          <span
            role="alert"
            className="text-xs text-destructive"
          >
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
