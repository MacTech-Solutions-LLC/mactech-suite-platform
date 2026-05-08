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
import { Sparkles, Bot } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { plannerLlmConfigured } from "@/lib/agents/llm";
import { listCapabilities } from "@/lib/agents/capabilities/registry";
import { listAllInvariants } from "@/lib/agents/intent/invariants";
import { IntentBuilder } from "@/components/agents/intent-builder";

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
            <Bot className="mr-1 inline h-3 w-3" />
            {readOnly} read-only · {approval} write capabilities · {invariantCount} invariants
          </span>
        }
      />

      {canCreate ? <IntentBuilder /> : null}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Recent runs ({runs.length})
        </h2>
        {runs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-4 w-4" />
            No agent runs yet. Type a request above to plan one.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
            {runs.map((r) => (
              <li key={r.id} className="p-3 text-sm">
                <Link
                  href={`/admin/agents/${r.id}`}
                  className="flex items-start justify-between gap-3 hover:underline"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
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

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "outline"
  | "muted";

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
