/**
 * AgentEmptyState — centered, lucide-glyph-only empty placeholder.
 *
 * No illustration, no shimmer. The brief explicitly forbids both: this
 * is a regulated-internal-ops console and decorative emptiness reads
 * as overconfidence. The action slot lets every empty render carry its
 * own primary CTA inside the container — instead of pointing at the
 * page-header button 200px away.
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface AgentEmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  /** Slot for a primary CTA — typically a Button with asChild + Link. */
  action?: ReactNode;
}

export function AgentEmptyState({ icon: Icon, title, body, action }: AgentEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
      <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      {body ? <div className="text-xs text-muted-foreground">{body}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
