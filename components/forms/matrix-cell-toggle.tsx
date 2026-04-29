"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Loader2 } from "lucide-react";
import { quickToggleEntitlement } from "@/lib/services/entitlement-service";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface MatrixCellToggleProps {
  customerOrganizationId: string;
  appRegistryId: string;
  customerOrgName: string;
  appName: string;
  appKey: string;
  initialEnabled: boolean;
  initialPlan: string | null;
}

export function MatrixCellToggle({
  customerOrganizationId,
  appRegistryId,
  customerOrgName,
  appName,
  appKey,
  initialEnabled,
  initialPlan,
}: MatrixCellToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [plan, setPlan] = useState(initialPlan);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = () => {
    if (pending) return;
    const next = !enabled;
    // Optimistic flip — server action below confirms or reverts.
    setEnabled(next);
    if (next && !plan) setPlan("starter");
    startTransition(async () => {
      try {
        await quickToggleEntitlement({
          customerOrganizationId,
          appRegistryId,
          enabled: next,
        });
        toast({
          title: next ? `Enabled ${appName}` : `Disabled ${appName}`,
          description: `for ${customerOrgName}${next ? ` (plan: ${plan ?? "starter"})` : ""}`,
          variant: next ? "success" : "default",
        });
        router.refresh();
      } catch (err) {
        // Revert optimistic state on failure.
        setEnabled(initialEnabled);
        setPlan(initialPlan);
        toast({
          title: "Failed to update entitlement",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={`${enabled ? "Disable" : "Enable"} ${appName} for ${customerOrgName}`}
      title={`${enabled ? "Click to disable" : "Click to enable"} ${appName} for ${customerOrgName} (${appKey})`}
      className={cn(
        "group inline-flex h-12 w-full items-center justify-center rounded-md border transition-colors",
        enabled
          ? "border-success/40 bg-success/10 text-[hsl(142_71%_55%)] hover:bg-success/20"
          : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        pending && "opacity-60 cursor-wait",
      )}
    >
      <div className="flex flex-col items-center gap-0.5">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : enabled ? (
          <Check className="h-4 w-4" />
        ) : (
          <Minus className="h-4 w-4" />
        )}
        {enabled && plan && (
          <span className="text-[9px] font-mono tracking-wide opacity-80">{plan}</span>
        )}
      </div>
    </button>
  );
}
