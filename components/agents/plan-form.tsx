"use client";

/**
 * Inline form on /admin/agents — types a natural-language request, posts
 * to /api/agents/plan, and (on success) redirects to the run detail page
 * so the requester immediately sees the plan + approval state.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const EXAMPLES = [
  "Summarize every open operational risk",
  "What deployment drift do we have right now?",
  "List failing GitHub workflows",
  "Show me recent repo activity across all linked repos",
  "Generate release notes for the most recent CommitSummary cycle",
];

export function PlanForm() {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: text }),
      });
      const body = (await resp.json()) as { ok?: boolean; runId?: string; error?: string };
      if (!resp.ok || !body.ok || !body.runId) {
        setError(body.error ?? "plan_failed");
        return;
      }
      router.push(`/admin/agents/${body.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "plan_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/40 p-4">
      <label className="block">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Ask the agent
        </div>
        <textarea
          rows={3}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g. Summarize every open operational risk"
          className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          disabled={busy}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !request.trim()}
          onClick={() => submit(request)}
        >
          {busy ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" />
          )}
          {busy ? "Planning…" : "Plan it"}
        </Button>
        {error ? (
          <span className="text-xs text-destructive font-mono">{error}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setRequest(ex)}
            className="rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary"
            disabled={busy}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
