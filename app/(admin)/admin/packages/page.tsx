/**
 * /admin/packages — Catalog of saleable packages. The marketing site
 * reads `status="active"` rows; everything else is staging.
 */

import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PackageForm } from "@/components/forms/package-form";
import { PackageStatusControl } from "@/components/packages/package-status-control";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const CYCLE_LABEL: Record<string, string> = {
  one_time: "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

/** Pull the package's granted training courses out of metadataJson. */
function extractTrainingCourses(metadataJson: unknown): string[] {
  const meta = (metadataJson ?? {}) as Record<string, unknown>;
  const training = (meta.training ?? {}) as Record<string, unknown>;
  const courses = training.courses;
  return Array.isArray(courses) ? courses.filter((c): c is string => typeof c === "string") : [];
}

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export default async function PackagesPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.PACKAGES_VIEW);

  const [packages, apps] = await Promise.all([
    prisma.package.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
    prisma.appRegistry.findMany({
      where: { status: "active", isInternalOnly: false },
      select: { appKey: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const live = packages.filter((p) => p.status !== "archived");
  const archived = packages.filter((p) => p.status === "archived");

  const renderRow = (pkg: (typeof packages)[number]) => (
    <TableRow key={pkg.id} className={pkg.status === "draft" ? "opacity-60" : undefined}>
      <TableCell>
        <div className="font-medium">{pkg.name}</div>
        {pkg.description ? (
          <div className="text-xs text-muted-foreground line-clamp-1">{pkg.description}</div>
        ) : null}
      </TableCell>
      <TableCell className="font-mono text-xs">{pkg.sku}</TableCell>
      <TableCell>{formatPrice(pkg.priceCents, pkg.currency)}</TableCell>
      <TableCell>{CYCLE_LABEL[pkg.billingCycle] ?? pkg.billingCycle}</TableCell>
      <TableCell className="capitalize">{pkg.entitlementTier}</TableCell>
      <TableCell>
        {pkg.includedAppKeys.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {pkg.includedAppKeys.map((k) => (
              <Badge key={k} variant="outline" className="font-mono text-xs">
                {k}
              </Badge>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell>
        <PackageStatusControl id={pkg.id} name={pkg.name} status={pkg.status} />
      </TableCell>
      <TableCell>
        <PackageForm
          apps={apps}
          triggerLabel="Edit"
          initial={{
            id: pkg.id,
            sku: pkg.sku,
            name: pkg.name,
            description: pkg.description,
            priceCents: pkg.priceCents,
            currency: pkg.currency,
            billingCycle: pkg.billingCycle,
            entitlementTier: pkg.entitlementTier,
            includedAppKeys: pkg.includedAppKeys,
            trainingCourses: extractTrainingCourses(pkg.metadataJson),
            status: pkg.status,
          }}
        />
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packages"
        description="The catalog the marketing site sells. Active packages are checkout-eligible; draft/archived are hidden from buyers."
        actions={<PackageForm apps={apps} triggerLabel="New package" />}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Apps</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {live.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No packages yet. Click <strong>New package</strong> to define one.
                  </TableCell>
                </TableRow>
              ) : null}
              {live.map(renderRow)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {archived.length > 0 ? (
        <details className="group rounded-lg border border-border">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">▸ </span>
            <span className="hidden group-open:inline">▾ </span>
            Archived ({archived.length}) — hidden from the marketing site
          </summary>
          <div className="border-t border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Apps</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>{archived.map(renderRow)}</TableBody>
            </Table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
