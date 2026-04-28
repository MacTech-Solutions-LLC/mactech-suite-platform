import { Badge } from "@/components/ui/badge";

export function PermissionBadge({ permission }: { permission: string }) {
  const [scope, area, action] = permission.split(":");
  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      <span className="text-muted-foreground">{scope}</span>
      {area && <span className="text-foreground">·{area}</span>}
      {action && <span className="text-primary">·{action}</span>}
    </Badge>
  );
}
