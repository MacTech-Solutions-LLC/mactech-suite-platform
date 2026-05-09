"use client";

/**
 * RepoSyncButton — Sprint 28.
 *
 * One-click "Sync now" per row on /admin/repositories. Fires the
 * syncRepoNow server action which calls
 * syncRepositoryByFullName(ctx, fullName) — gated on
 * REPOSITORIES_MANAGE; the action returns ok:false with reason
 * when the caller lacks the permission, and we surface the
 * reason inline.
 */

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncRepoNow } from "@/lib/services/command-center/repo-sync-actions";

interface Props {
  fullName: string;
}

export function RepoSyncButton({ fullName }: Props) {
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<{
    commits: number;
    runs: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    setLastResult(null);
    startTransition(async () => {
      try {
        const r = await syncRepoNow(fullName);
        if (!r.ok) {
          setError(r.reason ?? "sync_failed");
          return;
        }
        setLastResult({
          commits: r.commitsInserted ?? 0,
          runs: r.workflowRunsUpserted ?? 0,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "sync_failed");
      }
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      {lastResult ? (
        <span
          aria-live="polite"
          className="inline-flex items-center gap-1 text-[11px] text-success"
        >
          <Check className="h-3 w-3" />
          {lastResult.commits} new, {lastResult.runs} runs
        </span>
      ) : null}
      {error ? (
        <span
          aria-live="polite"
          className="text-[11px] text-destructive"
          title={error}
        >
          {error.length > 24 ? error.slice(0, 24) + "…" : error}
        </span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        aria-label={`Sync ${fullName} now`}
      >
        {pending ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Syncing…
          </>
        ) : (
          <>
            <RefreshCw className="mr-1 h-3 w-3" />
            <span className="hidden md:inline">Sync now</span>
            <span className="md:hidden">Sync</span>
          </>
        )}
      </Button>
    </div>
  );
}
