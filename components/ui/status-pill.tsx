import { Activity, AlertTriangle, ShieldOff, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthStatus } from "@prisma/client";

const TONE = {
  up: {
    label: "Up",
    classes: "bg-success/15 text-[hsl(142_71%_55%)] border-success/30",
    Icon: Activity,
  },
  degraded: {
    label: "Degraded",
    classes: "bg-warning/15 text-[hsl(38_92%_60%)] border-warning/30",
    Icon: AlertTriangle,
  },
  down: {
    label: "Down",
    classes: "bg-destructive/15 text-destructive border-destructive/30",
    Icon: ShieldOff,
  },
  unknown: {
    label: "Unknown",
    classes: "bg-muted text-muted-foreground border-border",
    Icon: HelpCircle,
  },
} as const;

export function StatusPill({
  status,
  className,
}: {
  status: HealthStatus | null | undefined;
  className?: string;
}) {
  const key = (status ?? "unknown") as HealthStatus;
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
      <Icon className="h-3 w-3" />
      {tone.label}
    </span>
  );
}
