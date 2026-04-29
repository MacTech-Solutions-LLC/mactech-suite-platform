"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncOrgFromClerk } from "@/lib/services/customer-org-service";

export function ClerkResyncButton({ orgId }: { orgId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await syncOrgFromClerk(orgId);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to sync");
            }
          })
        }
      >
        <RefreshCw className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        {pending ? "Syncing…" : "Resync from Clerk"}
      </Button>
      {error && (
        <span className="text-xs text-destructive ml-2 self-center">
          {error}
        </span>
      )}
    </>
  );
}
