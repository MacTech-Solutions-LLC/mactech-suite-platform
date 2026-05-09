"use client";

/**
 * WebhookDeliveryRetryButton — Sprint 26.
 *
 * One-click manual retry for a webhook delivery that's `pending`,
 * `failed`, or `abandoned`. Calls retryWebhookDelivery server
 * action; reflects the new outcome inline (delivered/abandoned)
 * with a brief flash before revalidation refreshes the row.
 */

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { retryWebhookDelivery } from "@/lib/services/webhook-service";
import type { WebhookDeliveryStatus } from "@prisma/client";

interface Props {
  deliveryId: string;
  status: WebhookDeliveryStatus;
}

export function WebhookDeliveryRetryButton({ deliveryId, status }: Props) {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<"delivered" | "abandoned" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Already-delivered rows don't need a retry; render nothing so the
  // cell stays clean.
  if (status === "delivered") return null;

  const onClick = () => {
    setError(null);
    setOutcome(null);
    startTransition(async () => {
      try {
        const r = await retryWebhookDelivery(deliveryId);
        if (!r.ok) {
          setError(r.reason);
          return;
        }
        setOutcome(r.status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "retry_failed");
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      {outcome === "delivered" ? (
        <span aria-live="polite" className="inline-flex items-center gap-1 text-[11px] text-success">
          <Check className="h-3 w-3" /> delivered
        </span>
      ) : null}
      {outcome === "abandoned" ? (
        <span aria-live="polite" className="inline-flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3" /> still failing
        </span>
      ) : null}
      {error ? (
        <span aria-live="polite" className="text-[11px] text-destructive" title={error}>
          {error.length > 24 ? error.slice(0, 24) + "…" : error}
        </span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        aria-label="Retry this delivery now"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <RefreshCw className="mr-1 h-3 w-3" />
            <span className="hidden md:inline">Retry now</span>
            <span className="md:hidden">Retry</span>
          </>
        )}
      </Button>
    </div>
  );
}
