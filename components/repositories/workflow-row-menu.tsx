"use client";

/**
 * WorkflowRowMenu — Sprint 24.
 *
 * Per-run dropdown on /admin/repositories/workflow-runs. The
 * external GitHub link already lives on the workflow-name cell;
 * this menu adds:
 *   - Ask AI about this run — prefills the page's AskAIPanel via
 *     ?prompt= with run name / repo / conclusion / branch.
 *   - Filter feed: failures only — for the all-runs view, narrows
 *     to ?failedOnly=true.
 */

import Link from "next/link";
import { Sparkles, Filter, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  workflowName: string;
  repoFullName: string;
  branch: string | null;
  conclusion: string | null;
  status: string;
  htmlUrl: string | null;
  alreadyFailedOnly: boolean;
}

export function WorkflowRowMenu({
  workflowName,
  repoFullName,
  branch,
  conclusion,
  status,
  htmlUrl,
  alreadyFailedOnly,
}: Props) {
  const askPrompt =
    `Tell me what failed in workflow "${workflowName}" on ${repoFullName} (branch ${branch ?? "?"}, status ${status}, conclusion ${conclusion ?? "?"}).` +
    (htmlUrl ? ` GitHub run: ${htmlUrl}.` : "") +
    " What's the most likely root cause and what's the right next step?";

  const askHref = `/admin/repositories/workflow-runs?prompt=${encodeURIComponent(
    askPrompt,
  )}${alreadyFailedOnly ? "&failedOnly=true" : ""}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label="More run actions"
          className="h-6 w-6 p-0"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={askHref} className="flex items-center gap-2 cursor-pointer">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Ask AI about this run</span>
          </Link>
        </DropdownMenuItem>
        {!alreadyFailedOnly ? (
          <DropdownMenuItem asChild>
            <Link
              href="/admin/repositories/workflow-runs?failedOnly=true"
              className="flex items-center gap-2 cursor-pointer"
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Filter: failures only</span>
            </Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
