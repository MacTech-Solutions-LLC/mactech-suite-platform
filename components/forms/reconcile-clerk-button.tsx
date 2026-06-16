"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { reconcileOrgMembersWithClerk } from "@/lib/services/user-service";

type Result = Awaited<ReturnType<typeof reconcileOrgMembersWithClerk>>;

export function ReconcileClerkButton({
  customerOrganizationId,
  variant = "outline",
  size = "default",
  disabled,
  label = "Sync with Clerk",
}: {
  customerOrganizationId: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await reconcileOrgMembersWithClerk(customerOrganizationId);
        setResult(r);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reconcile failed");
      }
    });
  };

  const open = result !== null || error !== null;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={run}
        disabled={pending || disabled}
        title="Compare local membership rows against Clerk and fix any drift"
      >
        <RefreshCw
          className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {pending ? "Syncing…" : label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setResult(null);
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {error ? "Sync failed" : "Sync complete"}
            </DialogTitle>
            <DialogDescription>
              {error
                ? "Membership state was not changed."
                : "Local membership rows now match Clerk for this organization."}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : result ? (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-3 gap-3 rounded-md border border-border p-3">
                <Stat label="Added" value={result.added} tone={result.added > 0 ? "primary" : "muted"} />
                <Stat
                  label="Removed"
                  value={result.removed}
                  tone={result.removed > 0 ? "warning" : "muted"}
                />
                <Stat label="Unchanged" value={result.unchanged} tone="muted" />
              </dl>
              {result.warnings.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <div className="font-medium">Warnings</div>
                  <ul className="mt-1 list-disc pl-4">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Every change was recorded in the central audit log.
                Reconciliation does not modify roles — only membership presence.
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "warning" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
        ? "text-warning"
        : "text-muted-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
