/**
 * /admin/agents — AgentOps console (Slice 5, polished by Sprint 20).
 *
 * Lists every AgentRun the operator can see, with a plan-creation form
 * up top. Read-only-only plans run on click; approval-required plans
 * are routed to /admin/agents/[id] for review by a different admin.
 *
 * Sprint 20 polish: filter chips by status, quick approve-and-execute
 * inline button on awaiting_approval rows (avoids the click-into-detail
 * round-trip when an admin just wants to approve obvious queue).
 *
 * The agent runtime itself (planner + capability registry + lifecycle
 * orchestrator) lives under lib/agents/. See docs/AGENT_OPS.md for
 * the safety contract.
 */

import Link from "next/link";
import { Sparkles, Bot, Target, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { plannerLlmConfigured } from "@/lib/agents/llm";
import { listCapabilities } from "@/lib/agents/capabilities/registry";
import { listAllInvariants } from "@/lib/agents/intent/invariants";
import { IntentBuilder } from "@/components/agents/intent-builder";
import { ClaudeToolSpec } from "@/components/agents/claude-tool-spec";
import { RunStatusBadge } from "@/components/agents/run-status-badge";
import { QuickApproveButton } from "@/components/agents/quick-approve-button";
import { AgentEmptyState } from "@/components/agents/empty-state";
import type { AgentRunStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: string; label: string; statuses: AgentRunStatus[] }> = [
  { key: "all", label: "All", statuses: [] },
  { key: "awaiting", label: "Awaiting approval", statuses: ["awaiting_approval"] },
  { key: "active", label: "Active", statuses: ["planned", "approved", "running"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  {
    key: "needs_attention",
    label: "Refused / Failed",
    statuses: ["refused", "failed", "rejected"],
  },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

interface SearchParams {
  status?: string;
  clone?: string;
  /** Sprint 29: AskAIPanel "Plan agent run" deep-link prefills via
   *  this. Server-side passed through to IntentBuilder as
   *  initialRequest. */
  request?: string;
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_VIEW);
  const canCreate = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  const canApprove = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_APPROVE);

  const activeFilter =
    FILTERS.find((f) => f.key === searchParams?.status) ?? FILTERS[0]!;

  // Sprint 22: clone-and-retry. /admin/agents/[id] sends operators
  // here with ?clone=<runId> when they click "Clone & retry" on a
  // terminal-state run. We fetch the prior run server-side and hand
  // its goal + request to IntentBuilder as initial values; the
  // operator then reviews + clicks Plan to create a fresh run.
  const cloneSource = searchParams?.clone
    ? await prisma.agentRun.findUnique({
        where: { id: searchParams.clone },
        select: { id: true, requestText: true, intentGoal: true },
      })
    : null;

  const runs = await prisma.agentRun.findMany({
    where:
      activeFilter.statuses.length === 0
        ? undefined
        : { status: { in: activeFilter.statuses } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const llmOn = plannerLlmConfigured();
  const caps = listCapabilities();
  const readOnly = caps.filter((c) => c.kind === "read_only").length;
  const approval = caps.filter((c) => c.kind === "approval_required").length;
  const invariantCount = listAllInvariants().length;

  // Lightweight per-filter counts so the chips show the queue depth.
  const counts = await prisma.agentRun.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const countByStatus = new Map<AgentRunStatus, number>(
    counts.map((c) => [c.status, c._count._all]),
  );
  function chipCount(f: typeof FILTERS[number]): number {
    if (f.statuses.length === 0) {
      return Array.from(countByStatus.values()).reduce((n, v) => n + v, 0);
    }
    return f.statuses.reduce((n, s) => n + (countByStatus.get(s) ?? 0), 0);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description={`IBE-gated agent runtime. Every plan declares a goal, scope, and indicators; the orchestrator refuses runs that violate the contract. Read-only summaries run on the requester's permission set; writes still go through human approval. ${
          llmOn
            ? "LLM planner is on."
            : "LLM planner is off — deterministic keyword planner is the fallback."
        }`}
        actions={
          <span className="text-xs text-muted-foreground">
            <Bot className="mr-1 inline h-3 w-3" aria-hidden="true" />
            {readOnly} read-only · {approval} write capabilities · {invariantCount} invariants
          </span>
        }
      />

      {canCreate ? (
        <IntentBuilder
          initialGoal={cloneSource?.intentGoal ?? undefined}
          initialRequest={
            cloneSource?.requestText ?? searchParams?.request ?? undefined
          }
          banner={
            cloneSource
              ? `Cloned from run ${cloneSource.id.slice(0, 8)} — review and click Plan to retry.`
              : searchParams?.request
                ? "Prefilled from an Ask AI conversation — declare a goal + scope and click Plan."
                : undefined
          }
        />
      ) : null}

      {canCreate ? <ClaudeToolSpec /> : null}

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {activeFilter.key === "all"
              ? `Recent runs (${runs.length})`
              : `${activeFilter.label} (${runs.length})`}
          </h2>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = f.key === activeFilter.key;
              const n = chipCount(f);
              return (
                <Link
                  key={f.key}
                  href={
                    f.key === "all"
                      ? "/admin/agents"
                      : `/admin/agents?status=${f.key}`
                  }
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors " +
                    (active
                      ? "border-primary/40 bg-primary/15 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground")
                  }
                >
                  <span>{f.label}</span>
                  <span className="font-mono tabular-nums opacity-70">{n}</span>
                </Link>
              );
            })}
          </div>
        </div>
        {runs.length === 0 ? (
          <AgentEmptyState
            icon={Sparkles}
            title={
              activeFilter.key === "all"
                ? "No agent runs yet"
                : `No runs match "${activeFilter.label}"`
            }
            body={
              activeFilter.key === "all"
                ? canCreate
                  ? "Declare an Intent above and click Plan to create your first run."
                  : "Once an admin plans a run, you'll see it here."
                : "Try a different filter or scroll the All view."
            }
            action={
              activeFilter.key !== "all" ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/agents">Show all runs</Link>
                </Button>
              ) : canCreate ? (
                <Button asChild size="sm" variant="outline">
                  <a href="#intent-builder">
                    <Target className="mr-1 h-3 w-3" aria-hidden="true" />
                    Open the planner
                  </a>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
            {runs.map((r) => {
              const isRequester = r.requestedByClerkUserId === ctx.clerkUserId;
              const showQuickApprove =
                canApprove && r.status === "awaiting_approval";
              return (
                <li key={r.id} className="p-3 text-sm">
                  <div className="flex items-start gap-3">
                    <Link
                      href={`/admin/agents/${r.id}`}
                      className="group min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <RunStatusBadge status={r.status} />
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {r.id.slice(0, 8)}
                        </span>
                        {r.deterministicPlan ? (
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            deterministic
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 line-clamp-2 text-foreground group-hover:text-primary">
                        {r.requestText}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{r.requestedByEmail}</span>
                        <span>· {r.plannedStepCount} step{r.plannedStepCount === 1 ? "" : "s"}</span>
                        <span>· {new Date(r.createdAt).toLocaleString()}</span>
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      {showQuickApprove ? (
                        <QuickApproveButton runId={r.id} isRequester={isRequester} />
                      ) : null}
                      <Link
                        href={`/admin/agents/${r.id}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Open run detail"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
