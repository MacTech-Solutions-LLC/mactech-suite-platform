import { PageHeader } from "@/components/layout/admin-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PermissionBadge } from "@/components/ui/permission-badge";
import { Info } from "lucide-react";
import { requirePlatformPermission } from "@/lib/authz";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_DEFINITIONS,
  CUSTOMER_ROLE_DEFINITIONS,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.ROLES_VIEW);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & permissions"
        description="Local role templates and the permission grants they confer."
      />

      <Alert variant="info">
        <Info className="h-4 w-4" />
        <AlertTitle>Clerk remains the identity authority</AlertTitle>
        <AlertDescription>
          Clerk owns identity, sessions, organization memberships, and core auth
          security. This screen documents MacTech&apos;s local role templates,
          product permissions, and authorization mappings — used by every server
          action and audit log entry.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="platform" className="space-y-4">
        <TabsList>
          <TabsTrigger value="platform">Platform roles</TabsTrigger>
          <TabsTrigger value="customer">Customer org roles</TabsTrigger>
        </TabsList>

        <TabsContent value="platform" className="grid gap-4 md:grid-cols-2">
          {PLATFORM_ROLE_DEFINITIONS.map((role) => (
            <Card key={role.key}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{role.name}</CardTitle>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {role.key}
                  </Badge>
                </div>
                <CardDescription>{role.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Permissions ({role.permissions.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.map((p) => (
                    <PermissionBadge key={p} permission={p} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="customer" className="grid gap-4 md:grid-cols-2">
          {CUSTOMER_ROLE_DEFINITIONS.map((role) => (
            <Card key={role.key}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{role.name}</CardTitle>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {role.key}
                  </Badge>
                </div>
                <CardDescription>{role.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Permissions ({role.permissions.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.map((p) => (
                    <PermissionBadge key={p} permission={p} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
