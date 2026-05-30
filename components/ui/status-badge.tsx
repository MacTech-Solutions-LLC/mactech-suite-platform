import { Badge } from "@/components/ui/badge";

const ACTIVE = ["active", "trialing"];
const WARN = ["onboarding", "invited", "trialing"];
const NEGATIVE = ["suspended", "expired", "archived", "disabled", "inactive", "unpaid", "revoked", "deleted", "hidden"];

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const value = (status ?? "unknown").toLowerCase();
  let variant: "default" | "success" | "warning" | "destructive" | "muted" = "muted";
  if (ACTIVE.includes(value)) variant = "success";
  else if (NEGATIVE.includes(value)) variant = "destructive";
  else if (WARN.includes(value)) variant = "warning";
  else if (value === "development") variant = "default";
  return (
    <Badge variant={variant} className={className}>
      {value.replace(/_/g, " ")}
    </Badge>
  );
}
