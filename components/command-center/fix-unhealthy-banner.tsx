"use client";

/**
 * FixUnhealthyBanner — Sprint 18.
 *
 * Renders on /command-center when there's at least one unhealthy
 * app whose repo is in the cross-repo agent's allowlist. One click
 * stages an awaiting_approval agent run per fixable app; the
 * operator reviews + approves on /admin/agents.
 *
 * Render-suppressed when the operator lacks AGENTS_CREATE — the
 * server action enforces it too, but no point showing a button you
 * can't use.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { Wrench, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stageFixUnhealthyRuns } from "@/lib/services/command-center/fix-unhealthy-actions";
import type { FixableApp } from "@/lib/services/command-center/fix-unhealthy-service";

interface Props {
  fixable: FixableApp[];
  /** Whether the operator has AGENTS_CREATE; if false, the banner
   *  renders as info-only without the action button. */
  canStage: boolean;
}

export function FixUnhealthyBanner({ fixable, canStage }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    staged: number;
    skipped: number;
    runIds: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (fixable.length === 0) return null;

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await stageFixUnhealthyRuns();
        if (!r.ok) {
          setError(r.reason ?? "stage_failed");
          return;
        }
        setResult({ staged: r.staged, skipped: r.skipped, runIds: r.runIds });
      } catch (err) {
        setError(err instanceof Error ? err.message : "stage_failed");
      }
    });
  };

  // After a successful stage, show a success state with a "review
  // them" link to /admin/agents — the natural next step.
  if (result) {
    return (
      <section className="rounded-lg border border-success/30 bg-success/5 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              {result.staged} agent run{result.staged === 1 ? "" : "s"} staged for review
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Each run files a <span className="font-mono">@claude</span> issue in the target
              repo asking Claude Code to add a public <code className="font-mono">/api/health</code>{" "}
              endpoint. The Suite never auto-merges — review each run before approving, then watch
              your repos for the resulting PRs.
              {result.skipped > 0 ? (
                <>
                  {" "}
                  ({result.skipped} app{result.skipped === 1 ? "" : "s"} skipped — already had an
                  in-flight run.)
                </>
              ) : null}
            </p>
            <Link
              href="/admin/agents"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Review {result.staged} run{result.staged === 1 ? "" : "s"}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-warning/30 bg-warning/5 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex flex-1 items-start gap-3">
          <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(38_92%_60%)]" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              {fixable.length} app{fixable.length === 1 ? "" : "s"} can be auto-fixed by the
              cross-repo agent
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              These apps are degraded, down, or unprobed — and their repos are in the agent
              allowlist. One click stages a <span className="font-mono">@claude</span> routine
              per app to add a public <code className="font-mono">/api/health</code>{" "}
              endpoint. Each run is{" "}
              <strong className="text-foreground">awaiting_approval</strong> — nothing fires until
              you review on <span className="font-mono">/admin/agents</span>.
            </p>
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              {fixable.slice(0, 6).map((a) => (
                <li key={a.appId} className="flex items-center gap-2">
                  <span
                    className={
                      a.symptom === "down"
                        ? "h-1.5 w-1.5 rounded-full bg-destructive"
                        : a.symptom === "degraded"
                          ? "h-1.5 w-1.5 rounded-full bg-warning"
                          : "h-1.5 w-1.5 rounded-full bg-muted-foreground"
                    }
                  />
                  <span className="font-medium text-foreground">{a.name}</span>
                  <span>·</span>
                  <span className="font-mono">{a.repoFullName}</span>
                  <span>·</span>
                  <span>{a.symptom}</span>
                </li>
              ))}
              {fixable.length > 6 ? (
                <li className="text-muted-foreground">+ {fixable.length - 6} more</li>
              ) : null}
            </ul>
            {error ? (
              <div className="mt-2 text-[11px] text-destructive">{error}</div>
            ) : null}
          </div>
        </div>
        {canStage ? (
          <Button onClick={onClick} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Staging…
              </>
            ) : (
              <>
                <Wrench className="mr-2 h-3.5 w-3.5" />
                Stage {fixable.length} agent run{fixable.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            Requires <span className="font-mono">platform:agents:create</span>
          </div>
        )}
      </div>
    </section>
  );
}
