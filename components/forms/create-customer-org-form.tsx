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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { createCustomerOrgSchema } from "@/lib/validations/customer-org";
import { createCustomerOrganization } from "@/lib/services/customer-org-service";
import type { AppRegistry } from "@prisma/client";

const customerTypes = ["dib", "prime", "subcontractor", "internal", "other"] as const;
const subscriptionTiers = ["starter", "professional", "enterprise", "federal"] as const;
const cmmcLevels = ["level1", "level2", "unknown"] as const;
const cuiBoundaries = ["none", "vault_only", "customer_managed", "hybrid"] as const;

export function CreateCustomerOrgForm({ apps }: { apps: Pick<AppRegistry, "id" | "appKey" | "name">[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New customer org
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create customer organization</DialogTitle>
          <DialogDescription>
            Provisions a Clerk organization (when configured) and the local MacTech
            customer record. Initial entitlements can be enabled now or later.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const fd = new FormData(event.currentTarget);
            const initialAppKeys = fd.getAll("initialAppKeys").map(String);
            const raw = {
              name: String(fd.get("name") || ""),
              legalName: String(fd.get("legalName") || ""),
              domain: String(fd.get("domain") || ""),
              cageCode: String(fd.get("cageCode") || ""),
              uei: String(fd.get("uei") || ""),
              duns: String(fd.get("duns") || ""),
              industry: String(fd.get("industry") || ""),
              customerType: String(fd.get("customerType") || "other"),
              subscriptionTier: String(fd.get("subscriptionTier") || "starter"),
              cmmcTargetLevel: String(fd.get("cmmcTargetLevel") || "unknown"),
              cuiBoundaryType: String(fd.get("cuiBoundaryType") || "none"),
              primaryContactName: String(fd.get("primaryContactName") || ""),
              primaryContactEmail: String(fd.get("primaryContactEmail") || ""),
              notes: String(fd.get("notes") || ""),
              initialAppKeys,
            };
            const parsed = createCustomerOrgSchema.safeParse(raw);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Invalid input");
              return;
            }
            startTransition(async () => {
              try {
                await createCustomerOrganization(parsed.data);
                setOpen(false);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to create");
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" name="name" required />
            <Field label="Legal name" name="legalName" />
            <Field label="Domain" name="domain" placeholder="example.com" />
            <Field label="Industry" name="industry" />
            <Field label="CAGE code" name="cageCode" />
            <Field label="UEI" name="uei" />
            <Field label="DUNS" name="duns" />
            <SelectField
              label="Customer type"
              name="customerType"
              options={[...customerTypes]}
              defaultValue="other"
            />
            <SelectField
              label="Subscription tier"
              name="subscriptionTier"
              options={[...subscriptionTiers]}
              defaultValue="starter"
            />
            <SelectField
              label="CMMC target level"
              name="cmmcTargetLevel"
              options={[...cmmcLevels]}
              defaultValue="unknown"
            />
            <SelectField
              label="CUI boundary type"
              name="cuiBoundaryType"
              options={[...cuiBoundaries]}
              defaultValue="none"
            />
            <Field
              label="Primary contact name"
              name="primaryContactName"
            />
            <Field
              label="Primary contact email"
              name="primaryContactEmail"
              type="email"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>

          <div className="grid gap-2">
            <Label>Initial apps to enable (trial)</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {apps.map((app) => (
                <label
                  key={app.id}
                  className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <Checkbox
                    name="initialAppKeys"
                    value={app.appKey}
                  />
                  <span>{app.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground font-mono">
                    {app.appKey}
                  </span>
                </label>
              ))}
            </div>
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
              {pending ? "Creating…" : "Create organization"}
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
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
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
