"use client";

/**
 * RotateApiKeyButton — Sprint 32.
 *
 * Issues a new key (same scopes/name) and revokes the old in one
 * click. Like createApiKey, the new plaintext is shown to the
 * operator exactly once after the rotate completes — they MUST
 * copy it before dismissing the dialog.
 *
 * The two writes are deliberately not transactional (see the
 * rotateApiKey service comment): old key keeps working until the
 * caller cuts over to the new one.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Copy, Check, AlertTriangle } from "lucide-react";
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
import { rotateApiKey } from "@/lib/services/api-key-service";

interface Props {
  id: string;
  name: string;
  prefix: string;
}

interface RotatedKey {
  prefix: string;
  plaintext: string;
}

export function RotateApiKeyButton({ id, name, prefix }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rotated, setRotated] = useState<RotatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setError(null);
    setRotated(null);
    setCopied(false);
  };

  const onClose = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (!next) {
      // After dismiss, refresh so the table re-renders with the new
      // (rotated) row + the old row in revoked status.
      if (rotated) router.refresh();
      reset();
    }
  };

  const onRotate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await rotateApiKey(id);
        setRotated({ prefix: r.prefix, plaintext: r.plaintext });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rotate");
      }
    });
  };

  const onCopy = async () => {
    if (!rotated) return;
    try {
      await navigator.clipboard.writeText(rotated.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard write failures are common in iframe / no-https
         contexts; ignore — the value is still visible in the box */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Rotate API key"
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        {!rotated ? (
          <>
            <DialogHeader>
              <DialogTitle>Rotate API key?</DialogTitle>
              <DialogDescription>
                Issue a new key with the same scopes and revoke{" "}
                <span className="font-mono">{prefix}…</span> ({name}). The old
                key keeps working until you cut over to the new one — there&rsquo;s
                a brief window where both are valid (intentional).
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => onClose(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={onRotate} disabled={pending}>
                {pending ? "Rotating…" : "Rotate key"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New key issued</DialogTitle>
              <DialogDescription>
                The old key (<span className="font-mono">{prefix}…</span>) is
                revoked. Copy the new plaintext below — it&rsquo;s shown exactly
                once.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(38_92%_60%)]" />
                <span>
                  Storing the plaintext anywhere outside your secrets manager
                  is a credential leak. Copy → paste → close.
                </span>
              </div>
              <div className="rounded-md border border-border bg-card p-3 font-mono text-xs break-all">
                {rotated.plaintext}
              </div>
              <div className="text-[11px] text-muted-foreground">
                New prefix: <span className="font-mono">{rotated.prefix}</span>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onCopy}>
                {copied ? (
                  <>
                    <Check className="mr-1 h-3 w-3 text-success" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </>
                )}
              </Button>
              <Button onClick={() => onClose(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
