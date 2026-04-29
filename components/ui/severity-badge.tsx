import { Badge } from "@/components/ui/badge";

export function SeverityBadge({
  severity,
  className,
}: {
  severity: string | null | undefined;
  className?: string;
}) {
  const value = (severity ?? "info").toLowerCase();
  let variant: "default" | "success" | "warning" | "destructive" | "muted" = "muted";
  switch (value) {
    case "info":
    case "low":
      variant = "default";
      break;
    case "medium":
    case "warning":
      variant = "warning";
      break;
    case "high":
    case "critical":
      variant = "destructive";
      break;
  }
  return (
    <Badge variant={variant} className={className}>
      {value}
    </Badge>
  );
}
