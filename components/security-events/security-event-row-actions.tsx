"use client";

/**
 * SecurityEventRowActions — Sprint 21.
 *
 * Inline ack/resolve/ignore buttons on each row of
 * /admin/security-events. Mirrors the RiskRowActions pattern:
 * compact button + dropdown for the less-common actions.
 *
 * The detail drawer (already rendered as a separate column) is
 * still the place to read the full event payload + add a note —
 * this component is the quick-triage path.
 */

import { useState, useTransition } from "react";
import { Check, Loader2, Search, CheckCircle2, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateSecurityEventStatus } from "@/lib/services/security-event-service";
import type { SecurityEventStatus } from "@prisma/client";

interface Props {
  eventId: string;
  status: SecurityEventStatus;
}

export function SecurityEventRowActions({ eventId, status }: Props) {
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function flash() {
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt((t) => (t && Date.now() - t > 1500 ? null : t)), 1700);
  }

  function set(next: SecurityEventStatus) {
    setError(null);
    startTransition(async () => {
      try {
        await updateSecurityEventStatus({ id: eventId, status: next });
        flash();
      } catch (err) {
        setError(err instanceof Error ? err.message : "save_failed");
      }
    });
  }

  const terminal = status === "resolved" || status === "ignored";

  return (
    <div className="flex items-center justify-end gap-1.5">
      {savedAt ? (
        <span aria-live="polite" className="inline-flex items-center gap-1 text-[11px] text-success">
          <Check className="h-3 w-3" /> saved
        </span>
      ) : null}
      {error ? (
        <span aria-live="polite" className="text-[11px] text-destructive" title={error}>
          {error.length > 24 ? error.slice(0, 24) + "…" : error}
        </span>
      ) : null}

      {status === "open" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => set("investigating")}
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Search className="mr-1 h-3 w-3" />
              <span className="hidden md:inline">Investigate</span>
              <span className="md:hidden">Inv.</span>
            </>
          )}
        </Button>
      ) : null}

      <Button
        size="sm"
        variant="outline"
        disabled={pending || terminal}
        onClick={() => set("resolved")}
        aria-label="Resolve event"
      >
        <CheckCircle2 className="h-3 w-3" />
        <span className="ml-1 hidden md:inline">Resolve</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" disabled={pending} aria-label="More">
            <EyeOff className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={pending || terminal}
            onClick={() => set("ignored")}
            className="flex items-center gap-2"
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span>Ignore (false positive)</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
