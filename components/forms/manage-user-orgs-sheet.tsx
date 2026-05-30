"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Building2,
  ExternalLink,
  Save,
} from "lucide-react";
import {
  addUserToOrg,
  updateOrgUserAccess,
  removeCustomerUser,
} from "@/lib/services/user-service";
import { CUSTOMER_ROLE_DEFINITIONS } from "@/lib/permissions";
import type { UserStatus } from "@prisma/client";

export interface OrgOption {
  id: string;
  name: string;
  slug: string;
}

export interface MembershipRow {
  id: string;
  customerOrganizationId: string;
  customerOrganizationName: string;
  customerOrganizationSlug: string;
  role: string;
  status: UserStatus;
}

export interface ManageUserOrgsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userProfileId: string;
  email: string;
  allOrgs: OrgOption[];
  memberships: MembershipRow[];
}

export function ManageUserOrgsSheet({
  open,
  onOpenChange,
  userProfileId,
  email,
  allOrgs,
  memberships,
}: ManageUserOrgsSheetProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [_, startTransition] = useTransition();

  const memberOrgIds = useMemo(
    () => new Set(memberships.map((m) => m.customerOrganizationId)),
    [memberships],
  );
  const availableOrgs = useMemo(
    () => allOrgs.filter((o) => !memberOrgIds.has(o.id)),
    [allOrgs, memberOrgIds],
  );

  const [addOrgId, setAddOrgId] = useState<string>(availableOrgs[0]?.id ?? "");
  const [addRoleKey, setAddRoleKey] = useState<string>(
    CUSTOMER_ROLE_DEFINITIONS[0]?.key ?? "",
  );

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setError(null);
    setPendingId(key);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => pendingId === null && onOpenChange(o)}>
      <SheetContent className="sm:max-w-lg md:max-w-xl">
        <SheetHeader>
          <SheetTitle>Organization memberships</SheetTitle>
          <SheetDescription>{email}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Existing memberships */}
          <section className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Current memberships ({memberships.length})
            </div>
            {memberships.length === 0 ? (
              <p className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
                Not a member of any customer organization yet.
              </p>
            ) : (
              <div className="space-y-2">
                {memberships.map((m) => (
                  <MembershipCard
                    key={m.id}
                    membership={m}
                    pendingId={pendingId}
                    onChangeRole={(role) =>
                      startTransition(() =>
                        wrap(`role-${m.id}`, async () => {
                          await updateOrgUserAccess({
                            customerOrganizationId: m.customerOrganizationId,
                            userProfileId,
                            role,
                          });
                        }),
                      )
                    }
                    onRemove={() =>
                      startTransition(() =>
                        wrap(`remove-${m.id}`, async () => {
                          await removeCustomerUser({
                            customerOrganizationId: m.customerOrganizationId,
                            userProfileId,
                          });
                        }),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* Add to org */}
          <section className="space-y-2 border-t border-border pt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Add to organization
            </div>
            {availableOrgs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Already a member of every customer organization.
              </p>
            ) : (
              <form
                className="grid gap-3 rounded-md border border-border p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!addOrgId || !addRoleKey) return;
                  startTransition(() =>
                    wrap("add", async () => {
                      await addUserToOrg({
                        userProfileId,
                        customerOrganizationId: addOrgId,
                        role: addRoleKey,
                      });
                      // Reset for repeated additions
                      const remaining = availableOrgs.filter((o) => o.id !== addOrgId);
                      setAddOrgId(remaining[0]?.id ?? "");
                    }),
                  );
                }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="add-org">Organization</Label>
                  <Select value={addOrgId} onValueChange={setAddOrgId}>
                    <SelectTrigger id="add-org">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOrgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                          <span className="ml-2 text-[10px] text-muted-foreground font-mono">
                            /{o.slug}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="add-role">Role</Label>
                  <Select value={addRoleKey} onValueChange={setAddRoleKey}>
                    <SelectTrigger id="add-role">
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
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={pendingId !== null || !addOrgId}
                  >
                    {pendingId === "add" ? (
                      "Adding…"
                    ) : (
                      <>
                        <Plus className="h-4 w-4" /> Add to organization
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </section>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MembershipCard({
  membership,
  pendingId,
  onChangeRole,
  onRemove,
}: {
  membership: MembershipRow;
  pendingId: string | null;
  onChangeRole: (role: string) => void;
  onRemove: () => void;
}) {
  const [role, setRole] = useState(membership.role);
  const dirty = role !== membership.role;
  const isRoleSaving = pendingId === `role-${membership.id}`;
  const isRemoving = pendingId === `remove-${membership.id}`;
  const blocked = pendingId !== null && !isRoleSaving && !isRemoving;

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/admin/customer-orgs/${membership.customerOrganizationId}`}
            className="flex items-center gap-2 text-sm font-medium hover:underline"
          >
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            {membership.customerOrganizationName}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </Link>
          <div className="text-[10px] text-muted-foreground font-mono">
            /{membership.customerOrganizationSlug}
          </div>
        </div>
        <StatusBadge status={membership.status} />
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="grid gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Role in this org
          </Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOMER_ROLE_DEFINITIONS.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant={dirty ? "default" : "outline"}
          size="sm"
          onClick={() => onChangeRole(role)}
          disabled={!dirty || blocked || isRoleSaving}
        >
          {isRoleSaving ? "Saving…" : (
            <>
              <Save className="h-3.5 w-3.5" /> {dirty ? "Save" : "Saved"}
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
          disabled={blocked || isRemoving}
          aria-label={`Remove from ${membership.customerOrganizationName}`}
        >
          {isRemoving ? "Removing…" : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {dirty && !isRoleSaving && (
        <Badge variant="warning" className="text-[10px]">
          unsaved role change
        </Badge>
      )}
    </div>
  );
}
