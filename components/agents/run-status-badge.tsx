/**
 * RunStatusBadge — single source of truth for AgentRunStatus → Badge
 * rendering. Three pages dispatched on this enum independently before
 * (admin/agents list, run detail, triggers list); each one was free to
 * drift from the others. Centralizing here also enforces the
 * `refused`-is-distinct-from-`awaiting_approval` rule from the brief.
 *
 * Server-friendly: pure function over a string, no client-only imports.
 */

import { XOctagon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type RunBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "refused"
  | "outline"
  | "muted";

function statusVariant(status: string): RunBadgeVariant {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
    case "rejected":
    case "cancelled":
      return "destructive";
    case "refused":
      return "refused";
    case "awaiting_approval":
      return "warning";
    case "running":
    case "approved":
      return "default";
    default:
      return "secondary";
  }
}

export interface RunStatusBadgeProps {
  status: string;
  /** Optional copy prefix, e.g. "last run: ". Status text is appended after. */
  prefix?: string;
}

export function RunStatusBadge({ status, prefix }: RunStatusBadgeProps) {
  const variant = statusVariant(status);
  const label = `${prefix ?? ""}${status.replace(/_/g, " ")}`;
  return (
    <Badge variant={variant} className="gap-1">
      {variant === "refused" ? (
        <XOctagon className="h-3 w-3" aria-hidden="true" />
      ) : null}
      {label}
    </Badge>
  );
}

const STEP_VARIANT: Record<string, RunBadgeVariant> = {
  succeeded: "success",
  failed: "destructive",
  running: "default",
  skipped: "muted",
};

export function StepStatusBadge({ status }: { status: string }) {
  const variant = STEP_VARIANT[status] ?? "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}
