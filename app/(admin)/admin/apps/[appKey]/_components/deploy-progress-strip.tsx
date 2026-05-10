/**
 * Sprint 50 — Deploy progress strip (Vivid /admin/apps/[appKey]).
 *
 * Renders the latest Railway deployment as a five-phase progression:
 *
 *   queued → initializing → building → deploying → success
 *                                                ↘ failed / crashed
 *
 * Each phase is a chip; the active phase animates a pulse glow,
 * already-passed phases glow steady cyan, future phases sit muted,
 * and a terminal failure flips the trailing chip to rose with an
 * alert icon.
 *
 * Pure server component — DeploymentSnapshot is a discrete row with
 * a single status, so rendering is mapping enum → chip. We don't try
 * to estimate elapsed time per phase here (that needs per-event
 * timestamps Railway's webhook doesn't currently surface).
 */

import { CheckCircle2, AlertOctagon, Clock, Cog, Hammer, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "queued" | "initializing" | "building" | "deploying" | "success";

const PHASES: Array<{
  key: Phase;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "queued", label: "Queued", Icon: Clock },
  { key: "initializing", label: "Init", Icon: Cog },
  { key: "building", label: "Build", Icon: Hammer },
  { key: "deploying", label: "Deploy", Icon: Rocket },
  { key: "success", label: "Live", Icon: CheckCircle2 },
];

const STATUS_TO_PHASE: Record<string, Phase | "failed" | "crashed" | "unknown"> = {
  queued: "queued",
  initializing: "initializing",
  building: "building",
  deploying: "deploying",
  success: "success",
  failed: "failed",
  crashed: "crashed",
  removed: "unknown",
  restarting: "deploying",
  sleeping: "success",
  skipped: "unknown",
  unknown: "unknown",
};

export interface DeployProgressStripProps {
  status: string;
  shortSha: string | null;
  checkedAt: Date;
  railwayDeploymentId?: string;
}

export function DeployProgressStrip({
  status,
  shortSha,
  checkedAt,
  railwayDeploymentId,
}: DeployProgressStripProps) {
  const mapped = STATUS_TO_PHASE[status] ?? "unknown";
  const isFailed = mapped === "failed" || mapped === "crashed";
  const isUnknown = mapped === "unknown";

  // Index of the current/last-completed phase. For terminal failure
  // we mark every phase before the failed one as completed and the
  // failure chip itself replaces the trailing "Live" chip.
  const activeIndex = isFailed
    ? PHASES.findIndex((p) => p.key === "deploying")
    : isUnknown
      ? -1
      : PHASES.findIndex((p) => p.key === mapped);
  const isTerminalSuccess = mapped === "success";

  return (
    <div className="rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-4 backdrop-blur-mt-glass md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
            Latest deploy
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mt-display text-base font-semibold text-mt-text">
              {shortSha ? <code className="font-mt-mono">{shortSha}</code> : "—"}
            </span>
            <span className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
              {checkedAt.toLocaleString()}
            </span>
          </div>
        </div>
        {railwayDeploymentId ? (
          <code className="hidden font-mt-mono text-[10px] uppercase tracking-[0.16em] text-mt-text-4 md:inline">
            {railwayDeploymentId.slice(0, 12)}
          </code>
        ) : null}
      </div>

      <ol
        className="flex items-center gap-1.5 overflow-x-auto pb-1"
        role="list"
        aria-label="Deployment progress"
      >
        {PHASES.map((p, i) => {
          const isLast = i === PHASES.length - 1;
          const replacedWithFailure = isLast && isFailed;
          const completed = !isUnknown && (isTerminalSuccess || i < activeIndex);
          const active = !isUnknown && !isFailed && i === activeIndex && !isTerminalSuccess;
          const Icon = replacedWithFailure ? AlertOctagon : p.Icon;
          const label = replacedWithFailure
            ? mapped === "crashed"
              ? "Crashed"
              : "Failed"
            : p.label;

          return (
            <li key={p.key} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-mt-2 border px-2.5 py-1 font-mt-mono text-[10px] uppercase tracking-[0.16em] transition",
                  replacedWithFailure
                    ? "border-mt-rose/40 bg-mt-rose/10 text-mt-rose"
                    : completed
                      ? "border-mt-cyan/30 bg-mt-cyan/8 text-mt-cyan"
                      : active
                        ? "border-mt-violet/40 bg-mt-violet/12 text-mt-violet animate-mt-pulse-glow"
                        : "border-mt-hairline bg-mt-surface-1 text-mt-text-4",
                )}
              >
                <Icon className="h-3 w-3" aria-hidden />
                {label}
              </span>
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-6 transition",
                    completed
                      ? "bg-mt-cyan/40"
                      : active
                        ? "bg-gradient-to-r from-mt-cyan/40 to-mt-violet/40"
                        : "bg-mt-hairline",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {isUnknown ? (
        <div className="mt-3 font-mt-mono text-[10px] uppercase tracking-[0.16em] text-mt-text-4">
          status: {status} — no progression to render
        </div>
      ) : null}
    </div>
  );
}
