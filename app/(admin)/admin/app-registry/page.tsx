import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { AppRegistryForm } from "@/components/forms/app-registry-form";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppRegistryPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.APP_REGISTRY_MANAGE);

  const apps = await prisma.appRegistry.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="App registry"
        description="The canonical list of MacTech apps. Audit log ingestion and entitlement assignment use these app keys."
        actions={<AppRegistryForm />}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Org context</TableHead>
                <TableHead>Internal only</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.length === 0 ? (
                <TableEmpty colSpan={7} message="No apps registered yet." />
              ) : (
                apps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div className="font-medium">{app.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {app.appKey}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{app.category}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono break-all">
                      {app.baseUrl || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={app.requiresOrgContext ? "outline" : "muted"}>
                        {app.requiresOrgContext ? "required" : "none"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={app.isInternalOnly ? "warning" : "muted"}>
                        {app.isInternalOnly ? "yes" : "no"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AppRegistryForm
                        triggerLabel="Edit"
                        initial={{
                          appKey: app.appKey,
                          name: app.name,
                          description: app.description,
                          baseUrl: app.baseUrl,
                          category: app.category,
                          status: app.status,
                          requiresOrgContext: app.requiresOrgContext,
                          isInternalOnly: app.isInternalOnly,
                        }}
                      />
                    </TableCell>
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
