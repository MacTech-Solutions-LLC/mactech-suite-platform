import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MatrixCellToggle } from "@/components/forms/matrix-cell-toggle";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "onboarding", "suspended", "archived"] as const;
const TIERS = ["starter", "professional", "enterprise", "federal"] as const;

export default async function ProductAccessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.ENTITLEMENTS_MANAGE);

  const q = readParam(searchParams, "q");
  const status = readParam(searchParams, "status");
  const tier = readParam(searchParams, "tier");
  const appKey = readParam(searchParams, "appKey");

  const where: Prisma.CustomerOrganizationWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { domain: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status && (STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof STATUSES)[number];
  }
  if (tier && (TIERS as readonly string[]).includes(tier)) {
    where.subscriptionTier = tier as (typeof TIERS)[number];
  }

  const [orgs, allApps] = await Promise.all([
    prisma.customerOrganization.findMany({
      // Internal MacTech orgs (e.g. MacTech Solutions) are not gated by
      // entitlements — operators are granted access to every app via
      // their UserProfile.isInternalMacTechUser flag. Excluding them
      // here keeps the matrix focused on real customer entitlements.
      where: { ...where, isInternalMacTech: false },
      orderBy: { name: "asc" },
      include: { entitlements: true },
    }),
    prisma.appRegistry.findMany({
      where: { isInternalOnly: false },
      orderBy: { name: "asc" },
    }),
  ]);

  const apps = appKey ? allApps.filter((a) => a.appKey === appKey) : allApps;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product access matrix"
        description="Click any cell to instantly toggle whether that customer org has access to that app. Every change is audited, mirrored to Clerk publicMetadata, and dispatched to webhook subscribers."
      />

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-5" method="get">
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="q">Search organizations</Label>
              <Input
                id="q"
                name="q"
                placeholder="Name, domain, slug"
                defaultValue={q ?? ""}
              />
            </div>
            <FilterSelect
              id="status"
              label="Status"
              defaultValue={status ?? "any"}
              options={[{ value: "any", label: "any" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
            />
            <FilterSelect
              id="tier"
              label="Tier"
              defaultValue={tier ?? "any"}
              options={[{ value: "any", label: "any" }, ...TIERS.map((t) => ({ value: t, label: t }))]}
            />
            <FilterSelect
              id="appKey"
              label="Focus on app"
              defaultValue={appKey ?? "any"}
              options={[
                { value: "any", label: "all apps" },
                ...allApps.map((a) => ({ value: a.appKey, label: a.name })),
              ]}
            />
            <div className="md:col-span-5 flex items-center justify-end gap-3">
              <Link
                href="/admin/product-access"
                className="text-xs underline-offset-2 hover:underline text-muted-foreground"
              >
                Reset
              </Link>
              <button
                type="submit"
                className="text-xs underline-offset-2 hover:underline text-muted-foreground"
              >
                Apply filters
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {orgs.length.toLocaleString()} {orgs.length === 1 ? "organization" : "organizations"}{" "}
            ×{" "}
            {apps.length.toLocaleString()} {apps.length === 1 ? "app" : "apps"}
          </CardTitle>
          <CardDescription>
            Green cells = enabled. Click to toggle. New entitlements default to
            <span className="font-mono"> plan=starter</span>; previously-set
            plans + seat caps + expirations are preserved.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[16rem] sticky left-0 bg-card z-10">
                  Customer organization
                </TableHead>
                {apps.map((app) => (
                  <TableHead key={app.id} className="text-center min-w-[7rem]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{app.name}</span>
                      <span className="text-[9px] font-mono opacity-60">
                        {app.appKey}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.length === 0 ? (
                <TableEmpty
                  colSpan={apps.length + 1}
                  message="No customer organizations match these filters."
                />
              ) : (
                orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="sticky left-0 bg-card z-10">
                      <Link
                        href={`/admin/customer-orgs/${org.id}/entitlements`}
                        className="font-medium hover:underline"
                      >
                        {org.name}
                      </Link>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px]">
                          {org.subscriptionTier}
                        </Badge>
                        <Badge variant="muted" className="text-[9px]">
                          CMMC {org.cmmcTargetLevel}
                        </Badge>
                        <span>· {org.status}</span>
                      </div>
                    </TableCell>
                    {apps.map((app) => {
                      const entitlement = org.entitlements.find(
                        (e) => e.appRegistryId === app.id,
                      );
                      return (
                        <TableCell key={app.id} className="text-center p-2">
                          <MatrixCellToggle
                            customerOrganizationId={org.id}
                            appRegistryId={app.id}
                            customerOrgName={org.name}
                            appName={app.name}
                            appKey={app.appKey}
                            initialEnabled={entitlement?.enabled ?? false}
                            initialPlan={entitlement?.plan ?? null}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function readParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  if (!searchParams) return null;
  const v = searchParams[key];
  if (typeof v === "string" && v.length > 0 && v !== "any") return v;
  return null;
}

function FilterSelect({
  id,
  label,
  options,
  defaultValue,
}: {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select name={id} defaultValue={defaultValue}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
