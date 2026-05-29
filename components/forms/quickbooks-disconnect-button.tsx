"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function QuickbooksDisconnectButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("Disconnect QuickBooks? Buyer checkout will stop working until reconnected.")) {
            return;
          }
          startTransition(async () => {
            setError(null);
            const res = await fetch("/api/integrations/quickbooks/disconnect", {
              method: "POST",
            });
            if (!res.ok) {
              const text = await res.text();
              setError(text || `Disconnect failed (${res.status})`);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Disconnecting…" : "Disconnect"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
