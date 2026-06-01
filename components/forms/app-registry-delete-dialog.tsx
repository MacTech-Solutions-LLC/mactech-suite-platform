"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteApp } from "@/lib/services/app-registry-service";

export interface AppDeletionImpact {
  entitlements: number;
  blockingReferences: number;
  repoLinks: number;
  dependencyEdges: number;
}

export function AppRegistryDeleteDialog({
  appKey,
  name,
  impact,
}: {
  appKey: string;
  name: string;
  impact: AppDeletionImpact;
}) {
  const [open, setOpen] = useState(false);
  const [confirmAppKey, setConfirmAppKey] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const blocked = impact.blockingReferences > 0;
  const confirmMatches = confirmAppKey === appKey;
  const mfaLooksValid = mfaCode.replace(/[\s-]/g, "").length >= 6;
  const canDelete = !pending && !blocked && confirmMatches && mfaLooksValid;

  function reset() {
    setConfirmAppKey("");
    setMfaCode("");
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          aria-label={`Delete ${name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete app?</DialogTitle>
          <DialogDescription>
            Permanently removes <span className="font-medium">{name}</span> (
            <span className="font-mono">{appKey}</span>) from the registry. This
            cannot be undone and requires multi-factor approval.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {blocked ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This app is still referenced by {impact.blockingReferences} suite
              object reference(s) and cannot be deleted until those are removed.
            </div>
          ) : (
            (impact.entitlements > 0 ||
              impact.repoLinks > 0 ||
              impact.dependencyEdges > 0) && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <div className="mb-1 font-medium">Deleting also removes:</div>
                <ul className="list-inside list-disc text-muted-foreground">
                  {impact.entitlements > 0 && (
                    <li>{impact.entitlements} customer entitlement(s)</li>
                  )}
                  {impact.repoLinks > 0 && (
                    <li>{impact.repoLinks} repository link(s)</li>
                  )}
                  {impact.dependencyEdges > 0 && (
                    <li>{impact.dependencyEdges} dependency edge(s)</li>
                  )}
                </ul>
              </div>
            )
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="confirmAppKey">
              Type <span className="font-mono">{appKey}</span> to confirm
            </Label>
            <Input
              id="confirmAppKey"
              value={confirmAppKey}
              onChange={(e) => setConfirmAppKey(e.target.value)}
              className="font-mono"
              autoComplete="off"
              disabled={pending || blocked}
              placeholder={appKey}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mfaCode" className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              MFA code
            </Label>
            <Input
              id="mfaCode"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="font-mono tracking-widest"
              disabled={pending || blocked}
              placeholder="123456"
            />
            <p className="text-xs text-muted-foreground">
              Enter the current 6-digit code from your authenticator app, or a
              backup code.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canDelete}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await deleteApp({ appKey, confirmAppKey, mfaCode });
                  setOpen(false);
                  reset();
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to delete app.");
                }
              });
            }}
          >
            {pending ? "Deleting…" : "Delete app"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
