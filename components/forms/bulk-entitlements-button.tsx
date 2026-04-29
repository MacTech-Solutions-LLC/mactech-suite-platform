"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckSquare, MinusSquare } from "lucide-react";
import { bulkSetEntitlements } from "@/lib/services/entitlement-service";
import { toast } from "@/components/ui/use-toast";

export function BulkEntitlementsButton({
  customerOrganizationId,
  appRegistryIds,
  enable,
  customerOrgName,
  appCount,
}: {
  customerOrganizationId: string;
  appRegistryIds: string[];
  enable: boolean;
  customerOrgName: string;
  appCount: number;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (appRegistryIds.length === 0) return null;

  const Icon = enable ? CheckSquare : MinusSquare;
  const label = enable
    ? `Enable all ${appCount} apps`
    : `Disable all ${appCount} apps`;

  return (
    <>
      <Button
        variant={enable ? "default" : "outline"}
        size="sm"
        onClick={() => setConfirm(true)}
        disabled={pending}
      >
        <Icon className="h-3.5 w-3.5" /> {label}
      </Button>
      <Dialog open={confirm} onOpenChange={(o) => !pending && setConfirm(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {enable ? "Enable" : "Disable"} all {appCount} apps for{" "}
              {customerOrgName}?
            </DialogTitle>
            <DialogDescription>
              {enable
                ? "Each app will be set to enabled with plan=starter (preserving any previously-set plan), audited, mirrored to Clerk publicMetadata, and dispatched to webhook subscribers."
                : "Each enabled app will be set to disabled+suspended, audited, and dispatched. Plans, seat caps, and configurations are preserved so re-enabling restores the previous setup."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirm(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant={enable ? "default" : "destructive"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    const result = await bulkSetEntitlements({
                      customerOrganizationId,
                      appRegistryIds,
                      enabled: enable,
                    });
                    const failures = result.results.filter((r) => !r.ok);
                    if (failures.length === 0) {
                      toast({
                        title: enable
                          ? `Enabled ${appCount} apps`
                          : `Disabled ${appCount} apps`,
                        description: `for ${customerOrgName}`,
                        variant: "success",
                      });
                    } else {
                      toast({
                        title: `Bulk ${enable ? "enable" : "disable"} partially succeeded`,
                        description: `${result.results.length - failures.length} OK, ${failures.length} failed.`,
                        variant: "warning",
                      });
                    }
                    setConfirm(false);
                    router.refresh();
                  } catch (err) {
                    toast({
                      title: "Bulk update failed",
                      description: err instanceof Error ? err.message : "Unknown error",
                      variant: "destructive",
                    });
                  }
                })
              }
            >
              {pending
                ? "Updating…"
                : enable
                  ? `Enable all ${appCount}`
                  : `Disable all ${appCount}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
