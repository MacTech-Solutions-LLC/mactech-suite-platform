"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteWebhook,
  updateWebhookStatus,
} from "@/lib/services/webhook-service";

export function WebhookRowActions({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: "active" | "paused" | "disabled";
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Webhook actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {status === "active" ? (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  await updateWebhookStatus(id, "paused");
                  router.refresh();
                })
              }
            >
              <Pause className="h-4 w-4" /> Pause
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  await updateWebhookStatus(id, "active");
                  router.refresh();
                })
              }
            >
              <Play className="h-4 w-4" /> Resume
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setConfirmDelete(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={(o) => !pending && setConfirmDelete(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete webhook?</DialogTitle>
            <DialogDescription>
              Deleting <span className="font-medium">{name}</span> drops the
              subscription and all delivery history. Sibling apps relying on
              this webhook will stop receiving events. Logged in audit; cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    await deleteWebhook(id);
                    setConfirmDelete(false);
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to delete");
                  }
                })
              }
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
