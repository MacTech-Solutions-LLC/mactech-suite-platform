"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertApp } from "@/lib/services/app-registry-service";
import { upsertAppSchema } from "@/lib/validations/app-registry";

const CATEGORIES = [
  "vault",
  "compliance",
  "evidence",
  "capture",
  "reporting",
  "training",
  "admin",
  "other",
] as const;
const STATUSES = ["active", "disabled", "development"] as const;

export function AppRegistryForm({
  initial,
  triggerLabel = "Register app",
}: {
  initial?: {
    appKey: string;
    name: string;
    description: string | null;
    baseUrl: string | null;
    category: string;
    status: string;
    requiresOrgContext: boolean;
    isInternalOnly: boolean;
  };
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [requiresOrgContext, setRequiresOrgContext] = useState(
    initial?.requiresOrgContext ?? true,
  );
  const [isInternalOnly, setIsInternalOnly] = useState(initial?.isInternalOnly ?? false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant={initial ? "outline" : "default"} size={initial ? "sm" : "default"}>
          {!initial && <Plus className="h-4 w-4" />}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit app" : "Register app"}</DialogTitle>
          <DialogDescription>
            App keys are stable identifiers used in audit logs and entitlements.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const fd = new FormData(event.currentTarget);
            const raw = {
              appKey: String(fd.get("appKey") || ""),
              name: String(fd.get("name") || ""),
              description: String(fd.get("description") || ""),
              baseUrl: String(fd.get("baseUrl") || ""),
              category: String(fd.get("category") || "other"),
              status: String(fd.get("status") || "development"),
              requiresOrgContext,
              isInternalOnly,
            };
            const parsed = upsertAppSchema.safeParse(raw);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Invalid input");
              return;
            }
            startTransition(async () => {
              try {
                await upsertApp(parsed.data);
                setOpen(false);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save");
              }
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="appKey">
              App key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="appKey"
              name="appKey"
              required
              defaultValue={initial?.appKey}
              disabled={Boolean(initial)}
              className="font-mono"
              placeholder="cui-vault"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={initial?.name} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={initial?.description ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              name="baseUrl"
              type="url"
              defaultValue={initial?.baseUrl ?? ""}
              placeholder="https://vault.mactechsolutionsllc.com"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Select name="category" defaultValue={initial?.category ?? "other"}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={initial?.status ?? "development"}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <ToggleRow
            label="Requires org context"
            description="App expects a customer org ID at launch."
            checked={requiresOrgContext}
            onCheckedChange={setRequiresOrgContext}
          />
          <ToggleRow
            label="Internal only"
            description="Hidden from customer-facing entitlement matrix."
            checked={isInternalOnly}
            onCheckedChange={setIsInternalOnly}
          />

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3">
      <div className="leading-tight">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
