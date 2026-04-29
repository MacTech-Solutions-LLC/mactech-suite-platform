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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, AlertTriangle } from "lucide-react";
import {
  updateCustomerOrgSchema,
  type UpdateCustomerOrgInput,
} from "@/lib/validations/customer-org";
import {
  updateCustomerOrganization,
  suspendCustomerOrganization,
} from "@/lib/services/customer-org-service";
import type { CustomerOrganization } from "@prisma/client";

const customerTypes = ["dib", "prime", "subcontractor", "internal", "other"] as const;
const subscriptionTiers = ["starter", "professional", "enterprise", "federal"] as const;
const cmmcLevels = ["level1", "level2", "unknown"] as const;
const cuiBoundaries = ["none", "vault_only", "customer_managed", "hybrid"] as const;
const statuses = ["active", "onboarding", "suspended", "archived"] as const;

export function CustomerOrgActions({ org }: { org: CustomerOrganization }) {
  return (
    <div className="flex flex-wrap gap-2">
      <EditCustomerOrgDialog org={org} />
      {org.status !== "suspended" && org.status !== "archived" && (
        <SuspendCustomerOrgDialog org={org} />
      )}
    </div>
  );
}

function EditCustomerOrgDialog({ org }: { org: CustomerOrganization }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5" /> Edit metadata
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit customer organization</DialogTitle>
          <DialogDescription>
            Updates are recorded in the central audit log with the changed field
            list and previous status.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const fd = new FormData(event.currentTarget);
            const maxMembersRaw = fd.get("maxMembers");
            const raw: UpdateCustomerOrgInput = {
              name: String(fd.get("name") || ""),
              legalName: String(fd.get("legalName") || ""),
              domain: String(fd.get("domain") || ""),
              cageCode: String(fd.get("cageCode") || ""),
              uei: String(fd.get("uei") || ""),
              duns: String(fd.get("duns") || ""),
              industry: String(fd.get("industry") || ""),
              customerType: fd.get("customerType") as never,
              subscriptionTier: fd.get("subscriptionTier") as never,
              cmmcTargetLevel: fd.get("cmmcTargetLevel") as never,
              cuiBoundaryType: fd.get("cuiBoundaryType") as never,
              status: fd.get("status") as never,
              primaryContactName: String(fd.get("primaryContactName") || ""),
              primaryContactEmail: String(fd.get("primaryContactEmail") || ""),
              notes: String(fd.get("notes") || ""),
              maxMembers: maxMembersRaw ? Number(maxMembersRaw) : undefined,
            };
            const parsed = updateCustomerOrgSchema.safeParse(raw);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Invalid input");
              return;
            }
            startTransition(async () => {
              try {
                const result = await updateCustomerOrganization(org.id, parsed.data);
                if (result.clerkSync && !result.clerkSync.ok) {
                  setError(
                    `Saved locally, but Clerk sync failed: ${result.clerkSync.error}.`,
                  );
                  router.refresh();
                  return;
                }
                setOpen(false);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save");
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" name="name" defaultValue={org.name} required />
            <Field label="Legal name" name="legalName" defaultValue={org.legalName ?? ""} />
            <Field label="Domain" name="domain" defaultValue={org.domain ?? ""} />
            <Field label="Industry" name="industry" defaultValue={org.industry ?? ""} />
            <Field label="CAGE code" name="cageCode" defaultValue={org.cageCode ?? ""} />
            <Field label="UEI" name="uei" defaultValue={org.uei ?? ""} />
            <Field label="DUNS" name="duns" defaultValue={org.duns ?? ""} />
            <SelectField
              label="Customer type"
              name="customerType"
              options={[...customerTypes]}
              defaultValue={org.customerType}
            />
            <SelectField
              label="Subscription tier"
              name="subscriptionTier"
              options={[...subscriptionTiers]}
              defaultValue={org.subscriptionTier}
            />
            <SelectField
              label="CMMC target level"
              name="cmmcTargetLevel"
              options={[...cmmcLevels]}
              defaultValue={org.cmmcTargetLevel}
            />
            <SelectField
              label="CUI boundary type"
              name="cuiBoundaryType"
              options={[...cuiBoundaries]}
              defaultValue={org.cuiBoundaryType}
            />
            <SelectField
              label="Status"
              name="status"
              options={[...statuses]}
              defaultValue={org.status}
            />
            <Field
              label="Primary contact name"
              name="primaryContactName"
              defaultValue={org.primaryContactName ?? ""}
            />
            <Field
              label="Primary contact email"
              name="primaryContactEmail"
              type="email"
              defaultValue={org.primaryContactEmail ?? ""}
            />
            <Field
              label="Max members (Clerk cap)"
              name="maxMembers"
              type="number"
              defaultValue={org.maxMembers != null ? String(org.maxMembers) : ""}
              placeholder="leave blank for no cap"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={org.notes ?? ""} />
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
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SuspendCustomerOrgDialog({ org }: { org: CustomerOrganization }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <AlertTriangle className="h-3.5 w-3.5" /> Suspend
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {org.name}?</DialogTitle>
          <DialogDescription>
            Suspending an organization keeps audit history intact but blocks the
            tenant&apos;s users from accessing any MacTech app. Recorded as a
            warning-level audit entry with the reason you provide.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                await suspendCustomerOrganization(org.id, reason || "(no reason)");
                setOpen(false);
                setReason("");
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to suspend");
              }
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer requested pause / non-payment / security incident / …"
            />
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
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Suspending…" : "Suspend organization"}
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
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Select name={name} defaultValue={defaultValue}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
