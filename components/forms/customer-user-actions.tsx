"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  KeyRound,
  Pause,
  Play,
  Trash2,
  ScrollText,
} from "lucide-react";
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
import {
  updateOrgUserAccess,
  removeCustomerUser,
} from "@/lib/services/user-service";
import { CUSTOMER_ROLE_DEFINITIONS } from "@/lib/permissions";
import type { UserStatus } from "@prisma/client";

export interface CustomerUserActionsProps {
  customerOrganizationId: string;
  userProfileId: string;
  email: string;
  currentRole: string;
  currentStatus: UserStatus;
}

export function CustomerUserActions(props: CustomerUserActionsProps) {
  const [roleOpen, setRoleOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "suspend" | "reactivate" | "remove">(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submitRole = (role: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await updateOrgUserAccess({
          customerOrganizationId: props.customerOrganizationId,
          userProfileId: props.userProfileId,
          role,
        });
        setRoleOpen(false);
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
        await updateOrgUserAccess({
          customerOrganizationId: props.customerOrganizationId,
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

  const submitRemove = () => {
    setError(null);
    startTransition(async () => {
      try {
        await removeCustomerUser({
          customerOrganizationId: props.customerOrganizationId,
          userProfileId: props.userProfileId,
        });
        setConfirm(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove user");
      }
    });
  };

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
          <DropdownMenuItem onSelect={() => setRoleOpen(true)}>
            <KeyRound className="h-4 w-4" /> Change role
          </DropdownMenuItem>
          {isActive ? (
            <DropdownMenuItem
              onSelect={() => setConfirm("suspend")}
              className="text-destructive focus:text-destructive"
            >
              <Pause className="h-4 w-4" /> Suspend user
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("reactivate")}>
              <Play className="h-4 w-4" /> Reactivate user
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setConfirm("remove")}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Remove from org
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              href={`/admin/audit-logs?actorEmail=${encodeURIComponent(props.email)}&orgId=${props.customerOrganizationId}`}
            >
              <ScrollText className="h-4 w-4" /> View audit activity
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={roleOpen} onOpenChange={(o) => !pending && setRoleOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change customer role</DialogTitle>
            <DialogDescription>{props.email}</DialogDescription>
          </DialogHeader>
          <RoleForm
            currentRole={props.currentRole}
            pending={pending}
            error={error}
            onCancel={() => setRoleOpen(false)}
            onSubmit={submitRole}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={confirm !== null} onOpenChange={(o) => !pending && !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "suspend" && "Suspend user?"}
              {confirm === "reactivate" && "Reactivate user?"}
              {confirm === "remove" && "Remove user from organization?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "suspend" &&
                `${props.email} will lose access to the apps enabled for this organization until reactivated. Logged in audit.`}
              {confirm === "reactivate" &&
                `${props.email} will regain access at their previous role.`}
              {confirm === "remove" && (
                <>
                  This will delete the OrgUserAccess row and (if Clerk is configured)
                  also remove the user from the Clerk organization. Their UserProfile
                  remains intact. This action is logged but cannot be undone.
                </>
              )}
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
              variant={confirm === "reactivate" ? "default" : "destructive"}
              onClick={() => {
                if (confirm === "remove") submitRemove();
                else if (confirm === "suspend") submitStatus("suspended");
                else if (confirm === "reactivate") submitStatus("active");
              }}
              disabled={pending}
            >
              {pending
                ? "Saving…"
                : confirm === "remove"
                  ? "Remove"
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
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  currentRole: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (role: string) => void;
}) {
  const [role, setRole] = useState<string>(currentRole);

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(role);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="org-role">Customer role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger id="org-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUSTOMER_ROLE_DEFINITIONS.map((r) => (
              <SelectItem key={r.key} value={r.key}>
                {r.name}
                <span className="ml-2 text-[10px] text-muted-foreground font-mono">
                  {r.key}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
