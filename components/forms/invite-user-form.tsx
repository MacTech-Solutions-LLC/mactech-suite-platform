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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { UserPlus } from "lucide-react";
import { inviteCustomerUser } from "@/lib/services/user-service";
import { inviteCustomerUserSchema } from "@/lib/validations/user";

export function InviteUserForm({
  customerOrganizationId,
  customerRoles,
  apps,
}: {
  customerOrganizationId: string;
  customerRoles: { key: string; name: string }[];
  apps: { id: string; appKey: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [sendInvite, setSendInvite] = useState(true);

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> Invite user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite customer user</DialogTitle>
          <DialogDescription>
            Provisions a UserProfile, OrgUserAccess, and (when configured) a Clerk
            organization invitation.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const fd = new FormData(event.currentTarget);
            const productAccess = fd.getAll("productAccess").map(String);
            const raw = {
              customerOrganizationId,
              email: String(fd.get("email") || ""),
              firstName: String(fd.get("firstName") || ""),
              lastName: String(fd.get("lastName") || ""),
              role: String(fd.get("role") || ""),
              productAccess,
              sendInvite,
            };
            const parsed = inviteCustomerUserSchema.safeParse(raw);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Invalid input");
              return;
            }
            startTransition(async () => {
              try {
                await inviteCustomerUser(parsed.data);
                setOpen(false);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to invite");
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" name="email" type="email" required />
            <div />
            <Field label="First name" name="firstName" />
            <Field label="Last name" name="lastName" />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="role">
                Role <span className="text-destructive">*</span>
              </Label>
              <Select name="role" required defaultValue={customerRoles[0]?.key}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {customerRoles.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Product access</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {apps.map((app) => (
                <label
                  key={app.id}
                  className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <Checkbox name="productAccess" value={app.appKey} />
                  <span>{app.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="leading-tight">
              <div className="text-sm font-medium">Send Clerk invitation email</div>
              <div className="text-xs text-muted-foreground">
                Disabled if Clerk is not configured.
              </div>
            </div>
            <Switch checked={sendInvite} onCheckedChange={setSendInvite} />
          </div>

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
              {pending ? "Inviting…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  type,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input id={name} name={name} type={type} required={required} />
    </div>
  );
}
