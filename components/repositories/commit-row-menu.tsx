"use client";

/**
 * CommitRowMenu — Sprint 23.
 *
 * Per-row dropdown for the commit feed: "Ask AI about this commit"
 * (deep-link prefills the page's AskAIPanel via ?prompt=) and
 * "Filter feed by repo / app". Sibling of the GitHub external link.
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
  shortSha: string;
  message: string;
  repoFullName: string;
  repoId: string;
  appLinks: Array<{ id: string; appKey: string }>;
  flags: string[];
}

export function CommitRowMenu({
  shortSha,
  message,
  repoFullName,
  repoId,
  appLinks,
  flags,
}: Props) {
  const oneLiner = message.split("\n")[0]!;
  const flagBlurb = flags.length > 0 ? ` [riskFlags: ${flags.join(", ")}]` : "";
  const askPrompt = `Tell me what's in commit ${shortSha} ("${oneLiner}") on ${repoFullName}${flagBlurb}. Was anything risky, and what should I check before this lands or rolls forward?`;

  const repoFilterHref = `/admin/repositories/commits?repoId=${repoId}`;
  const onlyApp = appLinks.length === 1 ? appLinks[0]! : null;
  const askHref = `/admin/repositories/commits?prompt=${encodeURIComponent(
    askPrompt,
  )}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label="More commit actions"
          className="h-6 w-6 p-0"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={askHref} className="flex items-center gap-2 cursor-pointer">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Ask AI about this commit</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={repoFilterHref}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Filter feed: this repo</span>
          </Link>
        </DropdownMenuItem>
        {onlyApp ? (
          <DropdownMenuItem asChild>
            <Link
              href={`/admin/repositories/commits?appId=${onlyApp.id}`}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="font-mono text-[11px]">
                Filter feed: {onlyApp.appKey}
              </span>
            </Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
