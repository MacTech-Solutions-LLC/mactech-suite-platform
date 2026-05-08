import { cn } from "@/lib/utils";
import type { RiskSeverity } from "@prisma/client";

const TONE: Record<RiskSeverity, string> = {
  info: "bg-muted text-muted-foreground border-border",
  low: "bg-secondary text-foreground border-border",
  medium: "bg-warning/15 text-[hsl(38_92%_60%)] border-warning/30",
  high: "bg-warning/25 text-[hsl(38_92%_70%)] border-warning/40",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

export function RiskBadge({
  severity,
  className,
}: {
  severity: RiskSeverity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
        TONE[severity],
        className,
      )}
    >
      {severity}
    </span>
  );
}
