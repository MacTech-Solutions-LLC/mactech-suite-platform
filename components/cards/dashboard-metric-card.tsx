import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function DashboardMetricCard({
  label,
  value,
  delta,
  icon: Icon,
  intent = "default",
  href,
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon?: LucideIcon;
  intent?: "default" | "success" | "warning" | "destructive";
  href?: string;
}) {
  const intentClasses = {
    default: "text-primary bg-primary/15",
    success: "text-[hsl(142_71%_55%)] bg-success/15",
    warning: "text-[hsl(38_92%_60%)] bg-warning/15",
    destructive: "text-destructive bg-destructive/15",
  } as const;

  const inner = (
    <CardContent className="flex items-start justify-between gap-3 p-5">
      <div className="space-y-1.5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {delta && <div className="text-xs text-muted-foreground">{delta}</div>}
      </div>
      <div className="flex flex-col items-end gap-2">
        {Icon && (
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md",
              intentClasses[intent],
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
        {href && (
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
    </CardContent>
  );

  if (!href) {
    return <Card>{inner}</Card>;
  }

  return (
    <Link
      href={href}
      className="group block rounded-lg ring-offset-background transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full transition-colors hover:border-primary/50 hover:bg-card/80">
        {inner}
      </Card>
    </Link>
  );
}
