"use client";

/**
 * Per-row action cluster on the triggers list — fire-now, toggle
 * enabled, edit link, delete. Optimistic UI: click → flips local
 * state → router.refresh() reconciles from server.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Play, Power, PowerOff, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

interface TriggerRowActionsProps {
  triggerId: string;
  enabled: boolean;
  canManage: boolean;
}

export function TriggerRowActions({ triggerId, enabled, canManage }: TriggerRowActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"fire" | "toggle" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm("Delete this trigger? This cannot be undone.")) return;
    setBusy("delete");
    setError(null);
    try {
      const r = await fetch(`/api/agents/triggers/${triggerId}`, { method: "DELETE" });
      const body = (await r.json()) as { ok: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "delete_failed");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete_failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={fire}
        disabled={!canManage || busy !== null}
        title="Fire now"
        className="rounded-md border border-border p-1 text-muted-foreground hover:bg-secondary/40 disabled:opacity-40"
      >
        {busy === "fire" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={toggle}
        disabled={!canManage || busy !== null}
        title={enabled ? "Disable" : "Enable"}
        className="rounded-md border border-border p-1 text-muted-foreground hover:bg-secondary/40 disabled:opacity-40"
      >
        {busy === "toggle" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : enabled ? (
          <PowerOff className="h-3.5 w-3.5" />
        ) : (
          <Power className="h-3.5 w-3.5" />
        )}
      </button>
      <Link
        href={`/admin/agents/triggers/${triggerId}/edit`}
        className="rounded-md border border-border p-1 text-muted-foreground hover:bg-secondary/40"
        title="Edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={!canManage || busy !== null}
        title="Delete"
        className="rounded-md border border-border p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
      >
        {busy === "delete" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
      {error ? <span className="ml-1 font-mono text-[10px] text-destructive">{error}</span> : null}
    </div>
  );
}
