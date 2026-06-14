"use client";

import { useMemo, useState, useTransition } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertPackage } from "@/lib/services/package-service";
import { upsertPackageSchema } from "@/lib/validations/package";

const BILLING_CYCLES = [
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
] as const;

const TIERS = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
  { value: "federal", label: "Federal" },
] as const;

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
] as const;

/** Training courses this package can grant (mirrors the training hub's
 *  CourseType). Selecting any of these unlocks the matching modules + role
 *  in the training hub when the order provisions.
 *
 *  CISSP_PRACTICE_EXAM is a paid feature (no Course content) — selecting it
 *  unlocks the /programs/cissp/practice-exam route in the hub. Standard
 *  tier is $25/user; DVOSB / SDVOSB tier is $15/user (create separate SKUs
 *  at the appropriate priceMajor for each). */
const TRAINING_COURSES = [
  { value: "AT_001_GENERAL", label: "General Awareness (AT-001)" },
  { value: "AT_002_ROLE_BASED", label: "Role-Based (AT-002)" },
  { value: "AT_INSIDER_THREAT", label: "Insider Threat" },
  { value: "IR_TABLETOP", label: "IR Tabletop + AAR" },
  { value: "CISSP_PRACTICE_EXAM", label: "CISSP Practice Exam (paid)" },
] as const;

export type PackageFormInitial = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  billingCycle: string;
  entitlementTier: string;
  includedAppKeys: string[];
  trainingCourses: string[];
  status: string;
};

export function PackageForm({
  initial,
  apps,
  triggerLabel,
}: {
  initial?: PackageFormInitial;
  apps: Array<{ appKey: string; name: string }>;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedApps, setSelectedApps] = useState<string[]>(
    initial?.includedAppKeys ?? [],
  );
  const [selectedTrainingCourses, setSelectedTrainingCourses] = useState<string[]>(
    initial?.trainingCourses ?? [],
  );
  const router = useRouter();

  const initialPriceMajor = useMemo(
    () => (initial ? (initial.priceCents / 100).toFixed(2) : ""),
    [initial],
  );

  const toggleApp = (appKey: string, checked: boolean) => {
    setSelectedApps((prev) => {
      if (checked) {
        return prev.includes(appKey) ? prev : [...prev, appKey];
      }
      return prev.filter((k) => k !== appKey);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant={initial ? "outline" : "default"} size={initial ? "sm" : "default"}>
          {!initial && <Plus className="h-4 w-4" />}
          {triggerLabel ?? (initial ? "Edit" : "New package")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit package" : "New package"}</DialogTitle>
          <DialogDescription>
            Packages are the SKUs the marketing site sells. Status &quot;active&quot; makes the
            package available for checkout.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const fd = new FormData(event.currentTarget);
            const raw = {
              id: initial?.id,
              sku: initial?.sku ?? String(fd.get("sku") || ""),
              name: String(fd.get("name") || ""),
              description: String(fd.get("description") || ""),
              priceMajor: String(fd.get("priceMajor") || "0"),
              currency: String(fd.get("currency") || "USD").toUpperCase(),
              billingCycle: String(fd.get("billingCycle") || "monthly"),
              entitlementTier: String(fd.get("entitlementTier") || "starter"),
              includedAppKeys: selectedApps,
              trainingCourses: selectedTrainingCourses,
              status: String(fd.get("status") || "draft"),
            };
            const parsed = upsertPackageSchema.safeParse(raw);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Invalid input");
              return;
            }
            startTransition(async () => {
              try {
                await upsertPackage(parsed.data);
                setOpen(false);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save");
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="sku">
                SKU <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sku"
                name="sku"
                required
                className="font-mono"
                placeholder="starter-monthly"
                defaultValue={initial?.sku}
                disabled={Boolean(initial)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required defaultValue={initial?.name} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={initial?.description ?? ""}
              placeholder="What's included, who it's for."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="priceMajor">Price</Label>
              <Input
                id="priceMajor"
                name="priceMajor"
                required
                type="number"
                step="0.01"
                min="0"
                defaultValue={initialPriceMajor}
                placeholder="49.00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                name="currency"
                maxLength={3}
                defaultValue={initial?.currency ?? "USD"}
                className="font-mono uppercase"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="billingCycle">Billing cycle</Label>
              <Select name="billingCycle" defaultValue={initial?.billingCycle ?? "monthly"}>
                <SelectTrigger id="billingCycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="entitlementTier">Entitlement tier</Label>
              <Select
                name="entitlementTier"
                defaultValue={initial?.entitlementTier ?? "starter"}
              >
                <SelectTrigger id="entitlementTier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={initial?.status ?? "draft"}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Included apps</Label>
            <div className="grid gap-1.5 rounded-md border border-border p-3 sm:grid-cols-2">
              {apps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No apps registered. Add them under App Registry first.
                </p>
              ) : (
                apps.map((app) => {
                  const checked = selectedApps.includes(app.appKey);
                  const id = `app-${app.appKey}`;
                  return (
                    <label
                      key={app.appKey}
                      htmlFor={id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(c) => toggleApp(app.appKey, Boolean(c))}
                      />
                      <span className="font-medium">{app.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {app.appKey}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Training courses granted</Label>
            <p className="text-xs text-muted-foreground">
              Buyers of this package get these training modules + role in the training
              hub on provisioning. Leave empty for non-training packages.
            </p>
            <div className="grid gap-1.5 rounded-md border border-border p-3 sm:grid-cols-2">
              {TRAINING_COURSES.map((course) => {
                const checked = selectedTrainingCourses.includes(course.value);
                const id = `course-${course.value}`;
                return (
                  <label key={course.value} htmlFor={id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(c) =>
                        setSelectedTrainingCourses((prev) =>
                          c
                            ? prev.includes(course.value)
                              ? prev
                              : [...prev, course.value]
                            : prev.filter((v) => v !== course.value),
                        )
                      }
                    />
                    <span className="font-medium">{course.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : initial ? "Save changes" : "Create package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
