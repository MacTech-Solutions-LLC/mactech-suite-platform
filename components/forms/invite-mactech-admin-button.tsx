"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
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
import { inviteMacTechAdmin } from "@/lib/services/user-service";
import { PLATFORM_ROLE_DEFINITIONS } from "@/lib/permissions";

type AdminRole = Exclude<
  (typeof PLATFORM_ROLE_DEFINITIONS)[number]["key"],
  "none"
>;
const ROLES = PLATFORM_ROLE_DEFINITIONS.filter(
  (r): r is (typeof PLATFORM_ROLE_DEFINITIONS)[number] & { key: AdminRole } =>
    r.key !== "none",
);

export function InviteMacTechAdminButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [platformRole, setAdminRole] = useState<AdminRole>(
    ROLES[0]?.key ?? "mactech_read_only",
  );

  const reset = () => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setAdminRole(ROLES[0]?.key ?? "mactech_read_only");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" />
          Invite MacTech admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite MacTech admin</DialogTitle>
          <DialogDescription>
            Sends a Clerk invitation to MacTech Solutions and grants the
            selected platform role on acceptance. Recorded in the central
            audit log.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                await inviteMacTechAdmin({
                  email,
                  firstName,
                  lastName,
                  platformRole,
                });
                setOpen(false);
                reset();
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Invite failed");
              }
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="mta-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mta-email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="firstname@mactechsolutionsllc.com"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mta-first">First name</Label>
              <Input
                id="mta-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mta-last">Last name</Label>
              <Input
                id="mta-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mta-role">Platform role</Label>
            <Select
              value={platformRole}
              onValueChange={(v) => setAdminRole(v as AdminRole)}
            >
              <SelectTrigger id="mta-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.name}
                    <span className="ml-2 text-[10px] text-muted-foreground font-mono">
                      {r.key}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ROLES.find((r) => r.key === platformRole)?.description}
            </p>
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
            <Button type="submit" disabled={pending || !email}>
              {pending ? "Sending invite…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
