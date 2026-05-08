"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

/**
 * "Sync now" button for the Command Center. Calls
 * POST /api/command-center/sync (manual path, requires
 * COMMAND_CENTER_MANAGE permission), then refreshes the page so the
 * fresh snapshot lands without a hard reload.
 */
export function SyncNowButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const resp = await fetch("/api/command-center/sync", { method: "POST" });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body.ok) {
        toast({
          title: "Sync failed",
          description: body.message ?? body.error ?? `HTTP ${resp.status}`,
          variant: "destructive",
        });
        return;
      }
      const o = body.outcome;
      const errors = o.perAppErrors?.length ?? 0;
      toast({
        title: errors > 0 ? "Sync completed with errors" : "Sync complete",
        description: `${o.appsHealthy} up · ${o.appsDegraded} degraded · ${o.appsDown} down · +${o.risksOpened} risks · ${errors} probe error(s) · ${o.durationMs}ms`,
        variant: errors > 0 ? "warning" : "default",
      });
      router.refresh();
    });
  };

  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Syncing…
        </>
      ) : (
        <>
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Sync now
        </>
      )}
    </Button>
  );
}
