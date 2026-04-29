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
import { Check, Minus } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ProductAccessPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.ENTITLEMENTS_MANAGE);

  const [orgs, apps] = await Promise.all([
    prisma.customerOrganization.findMany({
      orderBy: { name: "asc" },
      include: { entitlements: true },
    }),
    prisma.appRegistry.findMany({
      where: { isInternalOnly: false },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product access matrix"
        description="Customer × app entitlement matrix. Click a customer to manage detailed entitlement settings."
      />

      <Card>
        <CardHeader>
          <CardTitle>Entitlement matrix</CardTitle>
          <CardDescription>
            ✓ enabled · — disabled or unset. Status badge shows the entitlement state.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[16rem]">Customer organization</TableHead>
                {apps.map((app) => (
                  <TableHead key={app.id} className="text-center">
                    {app.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.length === 0 ? (
                <TableEmpty
                  colSpan={apps.length + 1}
                  message="No customer organizations to display."
                />
              ) : (
                orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <Link
                        href={`/admin/customer-orgs/${org.id}/entitlements`}
                        className="font-medium hover:underline"
                      >
                        {org.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {org.subscriptionTier} · CMMC {org.cmmcTargetLevel}
                      </div>
                    </TableCell>
                    {apps.map((app) => {
                      const entitlement = org.entitlements.find(
                        (e) => e.appRegistryId === app.id,
                      );
                      const enabled = entitlement?.enabled ?? false;
                      return (
                        <TableCell key={app.id} className="text-center">
                          {enabled ? (
                            <div className="flex flex-col items-center gap-1">
                              <Check className="h-4 w-4 text-success" />
                              <Badge variant="muted" className="text-[10px]">
                                {entitlement?.plan}
                              </Badge>
                            </div>
                          ) : (
                            <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                          )}
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
