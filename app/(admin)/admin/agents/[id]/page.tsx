/**
 * /admin/agents/[id] — single AgentRun: plan, steps, artifacts,
 * approval state, action buttons. Auditor replay surface.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Lock,
  Unlock,
  Bot,
  Target,
  ShieldCheck,
  AlertTriangle,
  XOctagon,
  KeyRound,
  Clock,
  User,
  ListOrdered,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { RunActions } from "@/components/agents/run-actions";
import {
  RunStatusBadge,
  StepStatusBadge,
} from "@/components/agents/run-status-badge";
import { AgentEmptyState } from "@/components/agents/empty-state";

export const dynamic = "force-dynamic";

export default async function AgentRunPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_VIEW);
  const run = await prisma.agentRun.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { stepIndex: "asc" } },
      artifacts: { orderBy: { createdAt: "asc" } },
      approvals: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!run) notFound();

  const canApprove = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_APPROVE);
  const canCreate = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  const isRequester = run.requestedByClerkUserId === ctx.clerkUserId;

  const triggerSource = pickTriggerSource(run);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/agents"
        className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden="true" />
        Back to agent runs
      </Link>

      <PageHeader
        title="Agent run"
        description={run.planSummary ?? run.requestText}
        actions={<RunStatusBadge status={run.status} />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <TriggeredByTile
          source={triggerSource}
          email={run.requestedByEmail}
          apiKeyName={run.triggeredByApiKeyName ?? run.triggeredByApiKeyId}
          createdAt={run.createdAt}
        />
        <Tile
          icon={ShieldCheck}
          label="Approved by"
          value={run.approvedByEmail ?? "—"}
          subtle={
            run.approvedAt
              ? new Date(run.approvedAt).toLocaleString()
              : run.requiresApproval
                ? "awaiting"
                : "not required"
          }
        />
        <Tile
          icon={ListOrdered}
          label="Steps"
          value={`${run.steps.length}`}
          subtle={
            run.requiresApproval
              ? `${run.steps.filter((s) => s.kind === "approval_required").length} approval-required`
              : "all read-only"
          }
        />
      </div>

      {run.status === "refused" && run.refusalReason ? (
        // Distinct from CRON_SECRET-style page-level warnings: solid
        // left accent strip + XOctagon glyph + outline (no fill) — the
        // brief calls this out as the visual treatment for "the IBE
        // contract did not hold".
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-warning/60 border-l-4 border-l-warning bg-transparent p-3 text-xs"
        >
          <XOctagon
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="font-semibold text-foreground">
              Refused — IBE invariant violation
            </div>
            <div className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
              {run.refusalReason}
            </div>
          </div>
        </div>
      ) : null}

      {run.intentGoal ? (
        <section className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Target className="h-3 w-3" aria-hidden="true" />
            Declared intent
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                goal:
              </span>{" "}
              {run.intentGoal}
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                risk_tolerance:
              </span>{" "}
              {run.intentRiskTolerance}
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                scope:
              </span>{" "}
              {run.intentScopeAppIds.length === 0 && run.intentScopeRepoIds.length === 0 ? (
                <span className="text-muted-foreground">unbounded</span>
              ) : (
                <span>
                  {run.intentScopeAppIds.length} app(s), {run.intentScopeRepoIds.length} repo(s)
                </span>
              )}
            </div>
            <DeclaredInvariantsList invariantsJson={run.intentInvariantsJson} />
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <RunActions
          runId={run.id}
          status={run.status}
          canApprove={canApprove}
          canExecute={canCreate || canApprove}
          isRequester={isRequester}
        />
        {canCreate &&
        ["refused", "failed", "rejected", "cancelled", "completed"].includes(
          run.status,
        ) ? (
          <Link
            href={`/admin/agents?clone=${run.id}#intent-builder`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs hover:bg-secondary"
            aria-label="Clone this run's intent into a new draft"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Clone & retry
          </Link>
        ) : null}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Original request
        </h2>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-card/40 p-3 text-xs">
          {run.requestText}
        </pre>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Plan ({run.steps.length} step{run.steps.length === 1 ? "" : "s"})
          {run.deterministicPlan ? (
            <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              deterministic
            </span>
          ) : (
            <span className="ml-2 text-[10px] uppercase tracking-widest text-primary">
              <Bot className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
              LLM-planned
            </span>
          )}
        </h2>
        {run.steps.length === 0 ? (
          <AgentEmptyState
            icon={AlertTriangle}
            title="The planner could not match this request"
            body="Try wording the request more concretely — name the capability, the app, or the metric you want — or enable the LLM planner if it is currently off."
          />
        ) : (
          <ol className="space-y-2">
            {run.steps.map((s) => {
              // Visual differentiation per brief: every step row carries
              // a left accent and a labeled badge naming its kind.
              const accent =
                s.kind === "approval_required"
                  ? "border-l-4 border-l-warning"
                  : "border-l-4 border-l-transparent";
              return (
                <li
                  key={s.id}
                  className={`rounded-md border border-border bg-card/40 p-3 text-sm ${accent}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(s.stepIndex).padStart(2, "0")}
                    </span>
                    {s.kind === "approval_required" ? (
                      <Badge variant="warning" className="gap-1">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        approval-required
                      </Badge>
                    ) : (
                      <Badge variant="muted" className="gap-1">
                        <Unlock className="h-3 w-3" aria-hidden="true" />
                        read-only
                      </Badge>
                    )}
                    <span className="font-medium">{s.capabilityKey}</span>
                    <StepStatusBadge status={s.status} />
                  </div>
                  {s.rationale ? (
                    <div className="mt-1 text-xs text-muted-foreground">{s.rationale}</div>
                  ) : null}
                  {Object.keys((s.inputJson ?? {}) as Record<string, unknown>).length > 0 ? (
                    <pre className="mt-2 overflow-x-auto rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
                      {JSON.stringify(s.inputJson, null, 2)}
                    </pre>
                  ) : null}
                  {s.outputJson ? (
                    <pre className="mt-2 overflow-x-auto rounded border border-border bg-success/5 p-2 font-mono text-[11px]">
                      {JSON.stringify(s.outputJson, null, 2)}
                    </pre>
                  ) : null}
                  {s.errorMessage ? (
                    <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                      {s.errorMessage}
                    </div>
                  ) : null}
                  {Array.isArray(s.invariantResultsJson) &&
                  (s.invariantResultsJson as unknown[]).length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {(
                        s.invariantResultsJson as Array<{
                          invariantKey: string;
                          ok: boolean;
                          message: string;
                        }>
                      ).map((r) => (
                        <li
                          key={r.invariantKey}
                          className={`flex items-start gap-1 rounded border px-2 py-1 text-[11px] ${
                            r.ok
                              ? "border-success/30 bg-success/5 text-foreground"
                              : "border-warning/40 bg-warning/10 text-foreground"
                          }`}
                        >
                          {r.ok ? (
                            <ShieldCheck
                              className="mt-0.5 h-3 w-3 shrink-0 text-success"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertTriangle
                              className="mt-0.5 h-3 w-3 shrink-0 text-warning"
                              aria-hidden="true"
                            />
                          )}
                          <div>
                            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                              {r.invariantKey}
                            </span>{" "}
                            — {r.message}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {run.artifacts.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Artifacts ({run.artifacts.length})
          </h2>
          <ul className="space-y-3">
            {run.artifacts.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-border bg-card/40 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{a.title}</div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {a.kind}
                  </span>
                </div>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 text-xs">
                  {a.bodyMarkdown}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {run.approvals.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Approval log
          </h2>
          <ul className="space-y-1.5">
            {run.approvals.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-border bg-card/40 p-2 text-xs"
              >
                <span className="font-mono text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString()}
                </span>{" "}
                — <strong>{a.decision}</strong> by {a.approverEmail}
                {a.notes ? ` — ${a.notes}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Per the brief: the M2M-triggered pill is removed from the page header
 * and consolidated into a single "Triggered by" tile here. The tile has
 * three modes — human, api-key, cron — selected from the run shape
 * without a schema change. */
type TriggerSource =
  | { kind: "human" }
  | { kind: "api-key" }
  | { kind: "cron" };

function pickTriggerSource(run: {
  triggeredByApiKeyId: string | null;
  requestedByClerkUserId: string;
}): TriggerSource {
  if (run.triggeredByApiKeyId) return { kind: "api-key" };
  if (run.requestedByClerkUserId.startsWith("cron:")) return { kind: "cron" };
  return { kind: "human" };
}

function TriggeredByTile(props: {
  source: TriggerSource;
  email: string;
  apiKeyName: string | null;
  createdAt: Date;
}) {
  const { source, email, apiKeyName, createdAt } = props;
  let icon: typeof User | typeof KeyRound | typeof Clock = User;
  let label = "Requested by";
  let value: string = email;
  let badge = "human";
  if (source.kind === "api-key") {
    icon = KeyRound;
    label = "Triggered by";
    value = apiKeyName ?? email;
    badge = "api-key";
  } else if (source.kind === "cron") {
    icon = Clock;
    label = "Triggered by";
    value = "cron schedule";
    badge = "cron";
  }
  const Icon = icon;
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3 w-3" aria-hidden="true" />
          {label}
        </div>
        <Badge variant="outline" className="font-mono text-[10px] uppercase">
          {badge}
        </Badge>
      </div>
      <div className="mt-0.5 truncate text-sm font-medium" title={value}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {new Date(createdAt).toLocaleString()}
      </div>
    </div>
  );
}

function Tile(props: {
  icon: typeof User;
  label: string;
  value: string;
  subtle?: string;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {props.label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium" title={props.value}>
        {props.value}
      </div>
      {props.subtle ? (
        <div className="text-[11px] text-muted-foreground">{props.subtle}</div>
      ) : null}
    </div>
  );
}

/**
 * Pretty-print declared invariants. The user picked them by friendly
 * label in the IntentBuilder; on replay they should see the same shape,
 * not raw JSON. Falls back to the JSON dump when the shape is unfamiliar
 * (defensive — the schema hasn't changed but auditors should always be
 * able to see the source of truth).
 */
function DeclaredInvariantsList({
  invariantsJson,
}: {
  invariantsJson: unknown;
}) {
  if (!invariantsJson || typeof invariantsJson !== "object") return null;
  const map = invariantsJson as Record<string, unknown>;
  const entries = Object.entries(map).filter(
    ([, v]) => Array.isArray(v) && v.length > 0,
  ) as Array<[string, string[]]>;
  if (entries.length === 0) return null;
  return (
    <details>
      <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
        declared invariants ({entries.length} capability
        {entries.length === 1 ? "" : "s"})
      </summary>
      <ul className="mt-1 space-y-1">
        {entries.map(([capKey, invKeys]) => (
          <li
            key={capKey}
            className="rounded border border-border bg-background p-1.5"
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {capKey}
            </div>
            <ul className="mt-0.5 flex flex-wrap gap-1">
              {invKeys.map((k) => (
                <li
                  key={k}
                  className="rounded-full border border-border bg-secondary/40 px-2 py-0.5 font-mono text-[10px] text-foreground"
                >
                  {k}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}
