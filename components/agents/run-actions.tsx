"use client";

/**
 * Buttons on /admin/agents/[id] — approve / reject / execute. Visibility
 * + enabled state are decided by the parent server component (which
 * knows the requester's permissions and whether they are the requester).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Play, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { humanizeAgentError } from "@/lib/agents/error-copy";

export interface RunActionsProps {
  runId: string;
  status: string;
  canApprove: boolean;
  canExecute: boolean;
  /** True when the viewer is the requester — they cannot self-approve. */
  isRequester: boolean;
}

export function RunActions(props: RunActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision === "approved" ? "approve" : "reject");
    setError(null);
    try {
      const resp = await fetch(`/api/agents/${props.runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: notes || undefined }),
      });
      const body = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !body.ok) {
        setError(body.error ?? "approve_failed");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "approve_failed");
    } finally {
      setBusy(null);
    }
  }

  async function execute() {
    setBusy("execute");
    setError(null);
    try {
      const resp = await fetch(`/api/agents/${props.runId}/execute`, { method: "POST" });
      const body = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !body.ok) {
        setError(body.error ?? "execute_failed");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "execute_failed");
    } finally {
      setBusy(null);
    }
  }

  const showApprove =
    props.status === "awaiting_approval" && props.canApprove && !props.isRequester;
  const showExecute =
    (props.status === "planned" || props.status === "approved") && props.canExecute;

  if (!showApprove && !showExecute) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/40 p-4">
      {showApprove ? (
        <>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Approve or reject
          </div>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for the audit log…"
            className="w-full rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            disabled={busy !== null}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={busy !== null}
              onClick={() => decide("approved")}
            >
              {busy === "approve" ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Check className="mr-1 h-3 w-3" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => decide("rejected")}
            >
              {busy === "reject" ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <X className="mr-1 h-3 w-3" />
              )}
              Reject
            </Button>
          </div>
        </>
      ) : null}

      {showExecute ? (
        <div>
          <Button size="sm" disabled={busy !== null} onClick={execute}>
            {busy === "execute" ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Play className="mr-1 h-3 w-3" />
            )}
            Execute plan
          </Button>
        </div>
      ) : null}

      {props.isRequester && props.status === "awaiting_approval" ? (
        <div className="text-xs text-muted-foreground">
          You requested this run, so you can&apos;t approve it yourself
          (separation of duties). A different admin must approve.
        </div>
      ) : null}

      {error ? (() => {
        const copy = humanizeAgentError(error);
        if (!copy) return null;
        return (
          <div role="alert" className="text-xs text-destructive">
            {copy.headline}{" "}
            <span className="ml-1 font-mono text-[10px] opacity-70">
              ({copy.slug})
            </span>
          </div>
        );
      })() : null}
    </div>
  );
}
