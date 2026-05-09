/**
 * /admin/agents — AgentOps console (Slice 5).
 *
 * Lists every AgentRun the operator can see, with a plan-creation form
 * up top. Read-only-only plans run on click; approval-required plans
 * are routed to /admin/agents/[id] for review by a different admin.
 *
 * The agent runtime itself (planner + capability registry + lifecycle
 * orchestrator) lives under lib/agents/. See docs/AGENT_OPS.md for
 * the safety contract.
 */

import Link from "next/link";
import { Sparkles, Bot, Target } from "lucide-react";
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
import { AgentEmptyState } from "@/components/agents/empty-state";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_VIEW);
  const canCreate = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE);

  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const llmOn = plannerLlmConfigured();
  const caps = listCapabilities();
  const readOnly = caps.filter((c) => c.kind === "read_only").length;
  const approval = caps.filter((c) => c.kind === "approval_required").length;
  const invariantCount = listAllInvariants().length;

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

      {canCreate ? <IntentBuilder /> : null}

      {canCreate ? <ClaudeToolSpec /> : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Recent runs ({runs.length})
        </h2>
        {runs.length === 0 ? (
          <AgentEmptyState
            icon={Sparkles}
            title="No agent runs yet"
            body={
              canCreate
                ? "Declare an Intent above and click Plan to create your first run."
                : "Once an admin plans a run, you'll see it here."
            }
            action={
              canCreate ? (
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
            {runs.map((r) => (
              <li key={r.id} className="p-3 text-sm">
                <Link
                  href={`/admin/agents/${r.id}`}
                  className="flex items-start justify-between gap-3 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="min-w-0 flex-1">
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
                      {r.requiresApproval ? (
                        <span className="text-[10px] uppercase tracking-widest text-warning">
                          needs approval
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 line-clamp-2 text-foreground">{r.requestText}</div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>{r.requestedByEmail}</span>
                      <span>· {r.plannedStepCount} step{r.plannedStepCount === 1 ? "" : "s"}</span>
                      <span>· {new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
