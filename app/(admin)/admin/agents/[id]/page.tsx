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
} from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { RunActions } from "@/components/agents/run-actions";

export const dynamic = "force-dynamic";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "outline"
  | "muted";

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

  return (
    <div className="space-y-6">
      <Link
        href="/admin/agents"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to agent runs
      </Link>

      <PageHeader
        title="Agent run"
        description={run.planSummary ?? run.requestText}
        actions={
          <div className="flex items-center gap-2">
            {run.triggeredByApiKeyId ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                <KeyRound className="h-3 w-3" />
                M2M-triggered
              </span>
            ) : null}
            <StatusBadge status={run.status} />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Tile
          label={run.triggeredByApiKeyId ? "Triggered via API key" : "Requested by"}
          value={
            run.triggeredByApiKeyId
              ? (run.triggeredByApiKeyName ?? run.triggeredByApiKeyId)
              : run.requestedByEmail
          }
          subtle={new Date(run.createdAt).toLocaleString()}
        />
        <Tile
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
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
          <XOctagon className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <div className="font-semibold text-warning">
              Refused — IBE invariant violation
            </div>
            <div className="mt-1 text-muted-foreground whitespace-pre-wrap break-words">
              {run.refusalReason}
            </div>
          </div>
        </div>
      ) : null}

      {run.intentGoal ? (
        <section className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Target className="h-3 w-3" />
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
            {run.intentInvariantsJson ? (
              <details>
                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                  declared invariants
                </summary>
                <pre className="mt-1 overflow-x-auto rounded border border-border bg-background p-2 font-mono text-[10px]">
                  {JSON.stringify(run.intentInvariantsJson, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        </section>
      ) : null}

      <RunActions
        runId={run.id}
        status={run.status}
        canApprove={canApprove}
        canExecute={canCreate || canApprove}
        isRequester={isRequester}
      />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Original request
        </h2>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-card/40 p-3 text-xs">
          {run.requestText}
        </pre>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Plan ({run.steps.length} step{run.steps.length === 1 ? "" : "s"})
          {run.deterministicPlan ? (
            <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              deterministic
            </span>
          ) : (
            <span className="ml-2 text-[10px] uppercase tracking-widest text-primary">
              <Bot className="mr-0.5 inline h-3 w-3" />
              LLM-planned
            </span>
          )}
        </h2>
        {run.steps.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            The planner could not match the request to any capability. Try wording it more
            concretely or enable the LLM planner.
          </div>
        ) : (
          <ol className="space-y-2">
            {run.steps.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-border bg-card/40 p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(s.stepIndex).padStart(2, "0")}
                  </span>
                  {s.kind === "approval_required" ? (
                    <Lock className="h-3 w-3 text-warning" />
                  ) : (
                    <Unlock className="h-3 w-3 text-muted-foreground" />
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
                          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
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
            ))}
          </ol>
        )}
      </section>

      {run.artifacts.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-2">
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
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-2">
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

function Tile(props: { label: string; value: string; subtle?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {props.label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{props.value}</div>
      {props.subtle ? (
        <div className="text-[11px] text-muted-foreground">{props.subtle}</div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: BadgeVariant = (() => {
    switch (status) {
      case "completed":
        return "success";
      case "failed":
      case "rejected":
      case "cancelled":
        return "destructive";
      case "refused":
        return "warning";
      case "awaiting_approval":
        return "warning";
      case "running":
      case "approved":
        return "default";
      default:
        return "secondary";
    }
  })();
  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}

function StepStatusBadge({ status }: { status: string }) {
  const variant: BadgeVariant = (() => {
    switch (status) {
      case "succeeded":
        return "success";
      case "failed":
        return "destructive";
      case "running":
        return "default";
      case "skipped":
        return "muted";
      default:
        return "secondary";
    }
  })();
  return <Badge variant={variant}>{status}</Badge>;
}
