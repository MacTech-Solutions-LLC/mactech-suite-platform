/**
 * AwaitingApprovalStrip — Sprint 40.
 *
 * Surfaces every awaiting_approval AgentRun inline on /command-center
 * with the existing QuickApproveButton attached. Lets the operator
 * triage the queue without leaving the dashboard.
 *
 * Renders only when there's at least one awaiting run; hidden on
 * quiet days.
 */

import Link from "next/link";
import { Bot, ChevronRight, Sparkles } from "lucide-react";
import { QuickApproveButton } from "@/components/agents/quick-approve-button";
import type { TodayDigest } from "@/lib/services/command-center/today-digest-service";

interface Props {
  runs: TodayDigest["awaitingApprovalRuns"];
  /** Viewer's clerk user id — used to flip the QuickApproveButton
   *  into the "you authored" disabled state for separation of
   *  duties. Server component reads this from auth context and
   *  passes through. */
  viewerClerkUserId: string;
  /** When false, surfaces the queue read-only with a CTA link to
   *  /admin/agents — operator lacks AGENTS_APPROVE. */
  canApprove: boolean;
}

export function AwaitingApprovalStrip({ runs, viewerClerkUserId, canApprove }: Props) {
  if (runs.length === 0) return null;
  return (
    <section className="rounded-lg border border-warning/30 bg-warning/5 p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-[hsl(38_92%_60%)]" />
        <h3 className="text-sm font-semibold text-foreground">
          {runs.length} agent run{runs.length === 1 ? "" : "s"} awaiting your
          approval
        </h3>
        <span className="text-xs text-muted-foreground">
          · approve here without leaving the dashboard
        </span>
        <Link
          href="/admin/agents?status=awaiting"
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open agent console
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="space-y-1.5">
        {runs.map((r) => {
          const isRequester = r.requestedByClerkUserId === viewerClerkUserId;
          return (
            <li
              key={r.id}
              className="overflow-hidden rounded-md border border-border bg-background/50"
            >
              <div className="flex items-start gap-3 p-3">
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <Link
                  href={`/admin/agents/${r.id}`}
                  className="group min-w-0 flex-1"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="truncate font-medium group-hover:text-primary">
                      {firstLine(r.intentGoal ?? r.requestText)}
                    </span>
                    {r.intentGoal && r.intentGoal !== r.requestText ? (
                      <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                        IBE-gated
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{r.requestedByEmail}</span>
                    {r.triggeredByApiKeyName ? (
                      <>
                        <span>·</span>
                        <span className="font-mono">
                          via {r.triggeredByApiKeyName}
                        </span>
                      </>
                    ) : null}
                    <span>·</span>
                    <span>
                      {r.plannedStepCount} step
                      {r.plannedStepCount === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>{timeAgo(r.createdAt)}</span>
                  </div>
                </Link>
                {canApprove ? (
                  <QuickApproveButton runId={r.id} isRequester={isRequester} />
                ) : (
                  <Link
                    href={`/admin/agents/${r.id}`}
                    className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2.5 text-[11px] hover:bg-secondary"
                  >
                    Review
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function firstLine(s: string): string {
  const idx = s.indexOf("\n");
  return idx === -1 ? s : s.slice(0, idx);
}

function timeAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
