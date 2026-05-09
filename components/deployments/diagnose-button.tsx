"use client";

/**
 * DiagnoseButton — Sprint 36.
 *
 * Inline expandable on a "Recently crashed" row. Click → fetches
 * the deploy's build/deploy logs via the diagnoseDeploymentSnapshot
 * server action, extracts the failure summary, renders the
 * one-liner root-cause + the last 25 error lines, and offers a
 * "Plan agent run to fix" deep-link that prefills IntentBuilder
 * with the build error context — closing the loop the operator
 * asked for: monitor → correct → iterate.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Stethoscope,
  Loader2,
  ChevronDown,
  ChevronUp,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { diagnoseDeploymentSnapshot } from "@/lib/services/command-center/deploy-diagnosis-actions";
import type { DiagnosisResult } from "@/lib/services/command-center/deploy-diagnosis-service";

interface Props {
  snapshotId: string;
  appKey: string | null;
  appName: string | null;
  /** Repo full name (owner/repo) for the "Plan agent run to fix"
   *  deep-link. When null, the agent button is hidden. */
  repoFullName: string | null;
}

export function DiagnoseButton({ snapshotId, appKey, appName, repoFullName }: Props) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);

  const fetchDiagnosis = () => {
    if (result?.ok) {
      setOpen((o) => !o);
      return;
    }
    startTransition(async () => {
      try {
        const r = await diagnoseDeploymentSnapshot(snapshotId);
        setResult(r);
        setOpen(true);
      } catch (err) {
        setResult({
          ok: false,
          reason: "logs_unavailable",
          message: err instanceof Error ? err.message : "fetch_failed",
        });
        setOpen(true);
      }
    });
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          fetchDiagnosis();
        }}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:border-destructive/40 hover:text-foreground"
        aria-label="Diagnose this deployment"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Stethoscope className="h-3 w-3" />
        )}
        <span>{pending ? "Loading…" : "Diagnose"}</span>
        {result?.ok ? (
          open ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </button>

      {open && result ? (
        <div className="mt-2 rounded-md border border-destructive/30 bg-background/60 p-2 text-[11px]">
          {!result.ok ? (
            <div className="text-destructive">
              {result.reason}
              {result.message ? (
                <span className="ml-1 text-muted-foreground">— {result.message}</span>
              ) : null}
            </div>
          ) : (
            <DiagnosisBody
              result={result}
              appKey={appKey}
              appName={appName}
              repoFullName={repoFullName}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function DiagnosisBody({
  result,
  appKey,
  appName,
  repoFullName,
}: {
  result: Extract<DiagnosisResult, { ok: true }>;
  appKey: string | null;
  appName: string | null;
  repoFullName: string | null;
}) {
  // Build the agent-fix deep-link. We feed IntentBuilder the build
  // error + a clear instruction for the cross-repo agent.
  const agentRequest = repoFullName
    ? buildAgentRequest({
        appKey,
        appName,
        repoFullName,
        rootCause: result.rootCause,
        errorTail: result.errorTail.map((l) => l.message).join("\n"),
        isBuildFailure: result.isBuildFailure,
      })
    : null;

  return (
    <div className="space-y-2">
      {result.rootCause ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Root cause (best guess)
          </div>
          <div className="mt-0.5 font-mono text-xs text-destructive">
            {result.rootCause}
          </div>
        </div>
      ) : null}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Last {result.errorTail.length} of {result.totalLines} lines
          {result.isBuildFailure ? " · build failure" : ""}
        </div>
        <pre className="mt-0.5 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-card/40 p-2 font-mono text-[10px] leading-snug text-muted-foreground">
{result.errorTail
  .map((l) => `${l.severity ? `[${l.severity.toLowerCase()}] ` : ""}${l.message}`)
  .join("\n")}
        </pre>
      </div>
      {agentRequest ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/admin/agents?request=${encodeURIComponent(agentRequest)}#intent-builder`}
            >
              <Bot className="mr-1 h-3 w-3" />
              Plan agent run to fix
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function buildAgentRequest(args: {
  appKey: string | null;
  appName: string | null;
  repoFullName: string;
  rootCause: string | null;
  errorTail: string;
  isBuildFailure: boolean;
}): string {
  const MAX = 1800;
  const head = `Use open_repo_pull_request with repoFullName=${args.repoFullName} to fix the failing ${args.isBuildFailure ? "build" : "deploy"} for ${args.appName ?? args.appKey ?? args.repoFullName}.\n\nintent: 'Fix the ${args.isBuildFailure ? "build" : "runtime"} failure described below. ${args.rootCause ? `Root cause: ${args.rootCause}.` : ""} Match the repo's existing conventions. Open a small PR with just the minimum change needed to make the deploy succeed.'\n\ncontextHint: 'See package.json + the failing file. Build error tail follows:'\n\n--- BUILD ERROR TAIL ---\n`;
  const room = MAX - head.length - 32;
  const tail =
    args.errorTail.length > room
      ? args.errorTail.slice(-room) + "\n…[truncated; full log on Railway]"
      : args.errorTail;
  return head + tail;
}
