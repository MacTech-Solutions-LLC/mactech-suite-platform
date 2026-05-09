"use client";

/**
 * Per-row action cluster on the triggers list. The primary action
 * (Fire now) is a labeled button so it announces itself; secondary +
 * destructive actions live behind a More-actions DropdownMenu so they
 * cannot be misclicked. Delete pops a Dialog confirm — `window.confirm`
 * is not screen-reader-friendly and ships a different visual style on
 * every browser, which conflicts with the audit-tool look.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Loader2,
  Play,
  Power,
  PowerOff,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { humanizeAgentError } from "@/lib/agents/error-copy";

interface TriggerRowActionsProps {
  triggerId: string;
  triggerName: string;
  enabled: boolean;
  canManage: boolean;
}

export function TriggerRowActions({
  triggerId,
  triggerName,
  enabled,
  canManage,
}: TriggerRowActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"fire" | "toggle" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function fire() {
    if (!canManage) return;
    setBusy("fire");
    setError(null);
    try {
      const r = await fetch(`/api/agents/triggers/${triggerId}/fire`, { method: "POST" });
      const body = (await r.json()) as { ok: boolean; runId?: string; error?: string };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "fire_failed");
        return;
      }
      if (body.runId) {
        router.push(`/admin/agents/${body.runId}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "fire_failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggle() {
    if (!canManage) return;
    setBusy("toggle");
    setError(null);
    try {
      const action = enabled ? "disable" : "enable";
      const r = await fetch(`/api/agents/triggers/${triggerId}?action=${action}`, {
        method: "POST",
      });
      const body = (await r.json()) as { ok: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "toggle_failed");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "toggle_failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!canManage) return;
    setBusy("delete");
    setError(null);
    try {
      const r = await fetch(`/api/agents/triggers/${triggerId}`, { method: "DELETE" });
      const body = (await r.json()) as { ok: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "delete_failed");
        setConfirmingDelete(false);
        return;
      }
      setConfirmingDelete(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete_failed");
      setConfirmingDelete(false);
    } finally {
      setBusy(null);
    }
  }

  const errorCopy = humanizeAgentError(error);

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={fire}
        disabled={!canManage || busy !== null}
        aria-label={`Fire trigger ${triggerName} now`}
      >
        {busy === "fire" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Fire now
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={!canManage || busy !== null}
            aria-label={`More actions for ${triggerName}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              toggle();
            }}
            disabled={!canManage || busy !== null}
          >
            {enabled ? (
              <PowerOff className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Power className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {enabled ? "Disable" : "Enable"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/agents/triggers/${triggerId}/edit`}>
              <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirmingDelete(true);
            }}
            disabled={!canManage || busy !== null}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {errorCopy ? (
        <span
          role="alert"
          className="ml-1 max-w-[18rem] truncate text-[11px] text-destructive"
          title={errorCopy.headline}
        >
          {errorCopy.headline}{" "}
          <span className="font-mono text-[10px] opacity-70">
            ({errorCopy.slug})
          </span>
        </span>
      ) : null}

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open && busy !== "delete") setConfirmingDelete(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this trigger?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{triggerName}</span>{" "}
              and its saved IBE Intent will be removed. Any in-flight runs that
              were already fired by this trigger keep running and stay in the
              audit log; only the schedule is destroyed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={busy === "delete"}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy === "delete"}
              onClick={remove}
            >
              {busy === "delete" ? (
                <Loader2
                  className="mr-1 h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              )}
              Delete trigger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
