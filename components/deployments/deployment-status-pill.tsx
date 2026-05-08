import {
  Activity,
  CheckCircle2,
  Hammer,
  Loader2,
  Moon,
  RotateCw,
  ShieldOff,
  Slash,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeploymentStatus } from "@prisma/client";

const TONE: Record<
  DeploymentStatus,
  {
    label: string;
    classes: string;
    Icon: React.ComponentType<{ className?: string }>;
    spin?: boolean;
  }
> = {
  queued: {
    label: "queued",
    classes: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    Icon: Loader2,
    spin: true,
  },
  initializing: {
    label: "init",
    classes: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    Icon: Loader2,
    spin: true,
  },
  building: {
    label: "building",
    classes: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    Icon: Hammer,
  },
  deploying: {
    label: "deploying",
    classes: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    Icon: RotateCw,
    spin: true,
  },
  success: {
    label: "live",
    classes: "border-success/30 bg-success/10 text-[hsl(142_71%_55%)]",
    Icon: CheckCircle2,
  },
  failed: {
    label: "failed",
    classes: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: ShieldOff,
  },
  crashed: {
    label: "crashed",
    classes: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: Activity,
  },
  removed: {
    label: "removed",
    classes: "border-border bg-muted text-muted-foreground",
    Icon: Trash2,
  },
  restarting: {
    label: "restarting",
    classes: "border-warning/40 bg-warning/10 text-[hsl(38_92%_60%)]",
    Icon: RotateCw,
    spin: true,
  },
  sleeping: {
    label: "sleeping",
    classes: "border-border bg-muted text-muted-foreground",
    Icon: Moon,
  },
  skipped: {
    label: "skipped",
    classes: "border-border bg-secondary text-muted-foreground",
    Icon: Slash,
  },
  unknown: {
    label: "unknown",
    classes: "border-border bg-muted text-muted-foreground",
    Icon: Activity,
  },
};

export function DeploymentStatusPill({
  status,
  className,
}: {
  status: DeploymentStatus | null | undefined;
  className?: string;
}) {
  const key = (status ?? "unknown") as DeploymentStatus;
  const tone = TONE[key];
  const Icon = tone.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-widest",
        tone.classes,
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", tone.spin && "animate-spin")} />
      {tone.label}
    </span>
  );
}
