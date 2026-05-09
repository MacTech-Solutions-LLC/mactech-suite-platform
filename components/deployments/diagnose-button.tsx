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
import {
  Stethoscope,
  Loader2,
  ChevronDown,
  ChevronUp,
  Bot,
  Check,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { diagnoseDeploymentSnapshot } from "@/lib/services/command-center/deploy-diagnosis-actions";
import { fileClaudeFixIssueForCrash } from "@/lib/services/command-center/file-claude-fix-actions";
import type { DiagnosisResult } from "@/lib/services/command-center/deploy-diagnosis-service";
import type { FileClaudeFixResult } from "@/lib/services/command-center/file-claude-fix-actions";

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
              snapshotId={snapshotId}
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
  snapshotId,
  appKey,
  appName,
  repoFullName,
}: {
  result: Extract<DiagnosisResult, { ok: true }>;
  snapshotId: string;
  appKey: string | null;
  appName: string | null;
  repoFullName: string | null;
}) {
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
      {repoFullName ? (
        <FileFixIssueButton
          snapshotId={snapshotId}
          repoFullName={repoFullName}
          appName={appName ?? appKey ?? repoFullName}
        />
      ) : (
        <div className="text-[11px] text-muted-foreground">
          No <code className="font-mono">repoFullName</code> on AppRegistry —
          set it before filing a fix issue.
        </div>
      )}
    </div>
  );
}

/**
 * Sprint 37: direct "file @claude fix issue" button. Bypasses the
 * Suite's IBE planner+approve pipeline — for a build/deploy crash
 * the action is bounded (one issue, one allowlisted repo) and the
 * GitHub PR review IS the gate. One click → issue filed → operator
 * sees the issue URL inline.
 */
function FileFixIssueButton({
  snapshotId,
  repoFullName,
  appName,
}: {
  snapshotId: string;
  repoFullName: string;
  appName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FileClaudeFixResult | null>(null);

  const filed = result?.ok && result.issueUrl;

  const onClick = () => {
    if (filed) return;
    startTransition(async () => {
      try {
        const r = await fileClaudeFixIssueForCrash(snapshotId);
        setResult(r);
      } catch (err) {
        setResult({
          ok: false,
          reason: "create_issue_failed",
          message: err instanceof Error ? err.message : "request_failed",
        });
      }
    });
  };

  if (filed) {
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
        <span className="inline-flex items-center gap-1 text-success">
          <Check className="h-3 w-3" />
          Issue #{result.issueNumber} filed
        </span>
        <a
          href={result.issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {repoFullName}#{result.issueNumber}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
        <span className="text-muted-foreground">
          · @claude will read the mention and open a PR shortly
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        title={`Files an issue in ${repoFullName} mentioning @claude with the build error context`}
      >
        {pending ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Bot className="mr-1 h-3 w-3" />
        )}
        File @claude fix issue
      </Button>
      <span className="text-[11px] text-muted-foreground">
        Direct GitHub issue → PR review on github.com (no IBE plan/approve)
      </span>
      {result && !result.ok ? (
        <div className="basis-full text-[11px] text-destructive">
          {result.reason}
          {result.message ? ` — ${result.message}` : ""}
        </div>
      ) : null}
    </div>
  );
}
