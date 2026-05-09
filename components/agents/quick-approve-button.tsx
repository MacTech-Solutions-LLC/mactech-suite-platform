"use client";

/**
 * QuickApproveButton — Sprint 20.
 *
 * Compact "Approve & Execute" button rendered inline on the
 * /admin/agents list page for runs in awaiting_approval status.
 * Combines the two-step (approve → execute) flow that
 * /admin/agents/[id] requires into a single click. Same
 * separation-of-duties rule applies — the requester can't
 * self-approve, and the API will refuse if they try.
 *
 * For the deeper "approve with notes / reject with reason" flow,
 * the row's chevron link still goes to the detail page where the
 * full RunActions component lives.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  runId: string;
  /** True when the viewer authored the run — disables the button
   *  with a tooltip rather than letting the API reject. */
  isRequester: boolean;
}

export function QuickApproveButton({ runId, isRequester }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isRequester) {
    return (
      <span
        className="text-[10px] uppercase tracking-widest text-muted-foreground/70"
        title="Approver and requester must be different users (separation of duties)."
      >
        you authored
      </span>
    );
  }

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const a = await fetch(`/api/agents/${runId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approved" }),
        });
        const ab = (await a.json()) as { ok?: boolean; error?: string };
        if (!a.ok || !ab.ok) {
          setError(ab.error ?? "approve_failed");
          return;
        }
        const e = await fetch(`/api/agents/${runId}/execute`, { method: "POST" });
        const eb = (await e.json()) as { ok?: boolean; error?: string };
        if (!e.ok || !eb.ok) {
          setError(eb.error ?? "execute_failed");
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "request_failed");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span className="text-[11px] text-destructive" title={error}>
          {error.length > 24 ? error.slice(0, 24) + "…" : error}
        </span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => {
          // Don't propagate up to the row-wrapping <Link> — clicking
          // approve must not also navigate to the detail page.
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
        disabled={pending}
      >
        {pending ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Running…
          </>
        ) : (
          <>
            <Check className="mr-1 h-3 w-3" />
            Approve & execute
          </>
        )}
      </Button>
    </div>
  );
}
