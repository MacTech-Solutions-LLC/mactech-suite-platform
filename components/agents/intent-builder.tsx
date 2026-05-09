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

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

/**
 * Sprint 19: per-category recipes for the Risk row "Fix this with
 * agent" deep-link. Adding a new category here unlocks the deep-link
 * for that risk; the RiskRowActions component checks AGENT_FIXABLE
 * (a parallel constant) to decide whether to render the menu item.
 */
const CROSS_REPO_FIX_RECIPES: Record<
  string,
  { goal: (appKey: string) => string; request: (appKey: string) => string }
> = {
  missing_health_endpoint: {
    goal: (appKey) =>
      `Create a public anonymous /api/health endpoint in the ${appKey} repository.`,
    request: (appKey) =>
      `Use open_repo_pull_request with repoFullName=MacTech-Solutions-LLC/${appKey} (or the operator's personal-account fork — check the AppRegistry repoFullName field). intent: 'Add a public anonymous /api/health Next.js route that returns JSON {status:"ok", service:"${appKey}", timestamp:<ISO-8601>}. The route must NOT be behind Clerk auth — exclude /api/health from middleware.ts public-route matching if needed. Match the repo's existing app/ vs pages/ convention.' contextHint: 'See package.json for framework version, README.md for conventions, middleware.ts for auth gate config. The MacTech Suite probes this endpoint anonymously every reconciliation tick.'`,
  },
  missing_build_info: {
    goal: (appKey) =>
      `Create a public anonymous /api/build-info endpoint in the ${appKey} repository.`,
    request: (appKey) =>
      `Use open_repo_pull_request with repoFullName=MacTech-Solutions-LLC/${appKey}. intent: 'Add a public anonymous /api/build-info Next.js route that returns JSON {service, environment, commitSha, commitShortSha, branch, repo, timestamp}. Read from RAILWAY_GIT_COMMIT_SHA and related Railway-injected env vars where available. The route must NOT be behind Clerk auth.' contextHint: 'See package.json + README.md. The MacTech Suite uses /api/build-info to detect production-behind-main drift.'`,
  },
};

export interface IntentBuilderProps {
  /** Sprint 22: when the operator arrived via "Clone & retry" on
   *  a prior run, the agents list page server-fetches that run and
   *  passes its goal + request as initial values. */
  initialGoal?: string;
  initialRequest?: string;
  /** Optional banner rendered above the form (e.g. "Cloned from
   *  run <id>"). */
  banner?: string;
}

export function IntentBuilder({
  initialGoal,
  initialRequest,
  banner,
}: IntentBuilderProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [intent, setIntent] = useState<IntentEditorValue>(() => {
    const empty = emptyIntentValue();
    if (initialGoal || initialRequest) {
      return {
        ...empty,
        goal: initialGoal ?? empty.goal,
        request: initialRequest ?? empty.request,
      };
    }
    return empty;
  });
  const [goalValid, setGoalValid] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const consumedRef = useRef(false);

  function applyTemplate(t: IntentTemplate) {
    setIntent((prev) => ({ ...prev, goal: t.goal, request: t.request }));
  }

  // Sprint 19: accept ?intent=cross_repo_fix&appKey=X&category=Y
  // from deep-links (e.g. the Risk row "Fix this with agent" item).
  // Maps category → a known recipe and prefills the request text +
  // intent goal so the operator can review and click Plan.
  useEffect(() => {
    if (consumedRef.current) return;
    const intentParam = searchParams.get("intent");
    if (intentParam !== "cross_repo_fix") return;
    const appKey = searchParams.get("appKey");
    const category = searchParams.get("category");
    if (!appKey || !category) return;
    const recipe = CROSS_REPO_FIX_RECIPES[category];
    if (!recipe) return;
    consumedRef.current = true;
    setIntent((prev) => ({
      ...prev,
      goal: recipe.goal(appKey),
      request: recipe.request(appKey),
    }));
    const next = new URLSearchParams(searchParams.toString());
    next.delete("intent");
    next.delete("appKey");
    next.delete("category");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // Scroll the operator to the IntentBuilder so the prefill is visible.
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        const el = document.getElementById("intent-builder");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [searchParams, router, pathname]);

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
      {banner ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
          <Sparkles className="mr-1.5 inline h-3 w-3 text-primary" aria-hidden="true" />
          {banner}
        </div>
      ) : null}
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
