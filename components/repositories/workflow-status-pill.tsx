import { Activity, CheckCircle2, Loader2, ShieldOff, Slash } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowConclusion, WorkflowStatus } from "@prisma/client";

interface Props {
  status: WorkflowStatus | string;
  conclusion: WorkflowConclusion | string | null;
  className?: string;
}

export function WorkflowStatusPill({ status, conclusion, className }: Props) {
  let tone = "border-border bg-muted text-muted-foreground";
  let label = String(conclusion ?? status);
  let Icon = Activity;

  if (status === "in_progress" || status === "queued") {
    tone = "border-blue-500/40 bg-blue-500/10 text-blue-400";
    label = status === "in_progress" ? "running" : "queued";
    Icon = Loader2;
  } else if (status === "completed" && conclusion === "success") {
    tone = "border-success/30 bg-success/10 text-[hsl(142_71%_55%)]";
    label = "success";
    Icon = CheckCircle2;
  } else if (
    status === "completed" &&
    (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure")
  ) {
    tone = "border-destructive/40 bg-destructive/10 text-destructive";
    label = String(conclusion);
    Icon = ShieldOff;
  } else if (status === "completed" && (conclusion === "cancelled" || conclusion === "skipped")) {
    tone = "border-border bg-secondary text-muted-foreground";
    label = String(conclusion);
    Icon = Slash;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-widest",
        tone,
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", status === "in_progress" && "animate-spin")} />
      {label}
    </span>
  );
}
