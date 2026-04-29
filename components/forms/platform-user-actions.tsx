"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, ShieldCheck, Pause, Play, ScrollText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updatePlatformUser } from "@/lib/services/user-service";
import { PLATFORM_ROLE_DEFINITIONS } from "@/lib/permissions";
import type { PlatformRole, UserStatus } from "@prisma/client";

type Mode = "promote" | "edit";

export interface PlatformUserActionsProps {
  userProfileId: string;
  email: string;
  isSelf: boolean;
  currentRole: PlatformRole;
  currentStatus: UserStatus;
}

export function PlatformUserActions(props: PlatformUserActionsProps) {
  const [open, setOpen] = useState<null | Mode>(null);
  const [confirm, setConfirm] = useState<null | "suspend" | "reactivate">(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submitRole = (role: PlatformRole) => {
    setError(null);
    startTransition(async () => {
      try {
        await updatePlatformUser({
          userProfileId: props.userProfileId,
          platformRole: role,
        });
        setOpen(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update role");
      }
    });
  };

  const submitStatus = (status: UserStatus) => {
    setError(null);
    startTransition(async () => {
      try {
        await updatePlatformUser({
          userProfileId: props.userProfileId,
          status,
        });
        setConfirm(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  };

  const isInternal = props.currentRole !== "none";
  const isActive = props.currentStatus === "active";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="User actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => setOpen(isInternal ? "edit" : "promote")}
          >
            <ShieldCheck className="h-4 w-4" />
            {isInternal ? "Change platform role" : "Grant platform access"}
          </DropdownMenuItem>
          {isActive ? (
            <DropdownMenuItem
              onSelect={() => setConfirm("suspend")}
              disabled={props.isSelf}
              className="text-destructive focus:text-destructive"
            >
              <Pause className="h-4 w-4" /> Suspend access
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("reactivate")}>
              <Play className="h-4 w-4" /> Reactivate access
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              href={`/admin/audit-logs?actorEmail=${encodeURIComponent(props.email)}`}
            >
              <ScrollText className="h-4 w-4" /> View audit trail
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Role change / promotion dialog */}
      <Dialog open={open !== null} onOpenChange={(o) => !pending && !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {open === "promote" ? "Grant platform access" : "Change platform role"}
            </DialogTitle>
            <DialogDescription>
              {props.email}
              {props.isSelf && " · This is you"}
            </DialogDescription>
          </DialogHeader>
          <RoleForm
            currentRole={props.currentRole}
            isSelf={props.isSelf}
            pending={pending}
            error={error}
            onCancel={() => setOpen(null)}
            onSubmit={submitRole}
          />
        </DialogContent>
      </Dialog>

      {/* Suspend / reactivate confirmation */}
      <Dialog open={confirm !== null} onOpenChange={(o) => !pending && !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "suspend" ? "Suspend access?" : "Reactivate access?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "suspend"
                ? `${props.email} will lose access to the Identity Command Center on their next request. This action is recorded in the audit log.`
                : `${props.email} will regain access at their previous platform role.`}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant={confirm === "suspend" ? "destructive" : "default"}
              onClick={() => submitStatus(confirm === "suspend" ? "suspended" : "active")}
              disabled={pending}
            >
              {pending
                ? "Saving…"
                : confirm === "suspend"
                  ? "Suspend"
                  : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoleForm({
  currentRole,
  isSelf,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  currentRole: PlatformRole;
  isSelf: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (role: PlatformRole) => void;
}) {
  const [role, setRole] = useState<PlatformRole>(
    currentRole === "none" ? "mactech_read_only" : currentRole,
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(role);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="role">Platform role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as PlatformRole)}>
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_ROLE_DEFINITIONS.map((r) => (
              <SelectItem
                key={r.key}
                value={r.key}
                disabled={isSelf && r.key !== "mactech_super_admin"}
              >
                {r.name}
                <span className="ml-2 text-[10px] text-muted-foreground font-mono">
                  {r.key}
                </span>
              </SelectItem>
            ))}
            <SelectItem value="none" disabled={isSelf}>
              Revoke (no platform access)
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Selecting <span className="font-mono">none</span> removes the user from
          the platform admin plane entirely. They keep their customer org access.
        </p>
        {isSelf && (
          <p className="text-xs text-warning">
            You cannot demote yourself. Ask another super admin if you need to step
            down.
          </p>
        )}
      </div>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
