"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { setPackageStatus } from "@/lib/services/package-service";

/**
 * Inline lifecycle control for a package row on /admin/packages.
 *
 *   active ──[switch off]──> draft        (greyed out, not for sale)
 *   draft  ──[switch on ]──> active       (live, checkout-eligible)
 *   any    ──[archive    ]──> archived    (hidden from the catalog)
 *   archived ──[restore  ]──> draft       (back to staging)
 */
export function PackageStatusControl({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = (next: "draft" | "active" | "archived", verb: string) => {
    startTransition(async () => {
      const result = await setPackageStatus(id, next);
      if (!result.ok) {
        toast({
          title: "Couldn't update package",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `${name} ${verb}`,
        description:
          next === "active"
            ? "Live in the catalog — buyers can purchase it."
            : next === "archived"
              ? "Hidden from the catalog."
              : "Saved as a draft — hidden from buyers.",
        variant: next === "active" ? "success" : "default",
      });
      router.refresh();
    });
  };

  if (status === "archived") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Archived</span>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => apply("draft", "restored")}
        >
          <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> Restore
        </Button>
      </div>
    );
  }

  const isActive = status === "active";

  return (
    <div className="flex items-center gap-2.5">
      <Switch
        checked={isActive}
        disabled={pending}
        aria-label={isActive ? "Set to draft" : "Set to active"}
        onCheckedChange={(checked) =>
          apply(checked ? "active" : "draft", checked ? "activated" : "set to draft")
        }
      />
      <span
        className={
          isActive
            ? "text-sm font-medium text-foreground"
            : "text-sm text-muted-foreground"
        }
      >
        {isActive ? "Active" : "Draft"}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        disabled={pending}
        aria-label="Archive package"
        title="Archive"
        onClick={() => apply("archived", "archived")}
      >
        <Archive className="h-4 w-4" />
      </Button>
    </div>
  );
}
