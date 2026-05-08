import { ArrowDown, Check, GitBranch, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  liveSha: string | null;
  headSha: string | null;
  commitsBehind: number | null;
  className?: string;
}

/**
 * Production-vs-main drift indicator.
 *   green check  — live SHA matches HEAD
 *   amber arrow  — N commits behind
 *   gray icon    — unknown (no build-info or no head sha yet)
 */
export function DriftBadge({ liveSha, headSha, commitsBehind, className }: Props) {
  if (!liveSha || !headSha) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground", className)}>
        <HelpCircle className="h-3 w-3" />
        unknown
      </span>
    );
  }
  if (liveSha === headSha || commitsBehind === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] text-[hsl(142_71%_55%)]", className)}>
        <Check className="h-3 w-3" />
        current
      </span>
    );
  }
  if (commitsBehind === null) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground font-mono", className)}>
        <GitBranch className="h-3 w-3" />
        diverged
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-mono",
        commitsBehind >= 5
          ? "border-warning/40 bg-warning/15 text-[hsl(38_92%_60%)]"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <ArrowDown className="h-3 w-3" />
      {commitsBehind} behind
    </span>
  );
}
