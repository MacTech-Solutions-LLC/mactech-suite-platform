import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { InviteUserForm } from "@/components/forms/invite-user-form";
import { CustomerUserActions } from "@/components/forms/customer-user-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { initialsFor, relativeTime } from "@/lib/utils";
import { CUSTOMER_ROLE_DEFINITIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function CustomerOrgUsersPage({
  params,
}: {
  params: { orgId: string };
}) {
  const org = await prisma.customerOrganization.findUnique({
    where: { id: params.orgId },
  });
  if (!org) notFound();

  const [accesses, apps] = await Promise.all([
    prisma.orgUserAccess.findMany({
      where: { customerOrganizationId: org.id },
      include: { userProfile: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.appRegistry.findMany({
      where: { status: "active", isInternalOnly: false },
      select: { id: true, appKey: true, name: true },
    }),
  ]);

  const roleNameByKey = new Map(
    CUSTOMER_ROLE_DEFINITIONS.map((r) => [r.key, r.name]),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <InviteUserForm
          customerOrganizationId={org.id}
          customerRoles={CUSTOMER_ROLE_DEFINITIONS.map((r) => ({
            key: r.key,
            name: r.name,
          }))}
          apps={apps}
        />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accesses.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  message="No customer users yet. Invite the first one with the button above."
                />
              ) : (
                accesses.map((a) => {
                  const fullName = [a.userProfile.firstName, a.userProfile.lastName]
                    .filter(Boolean)
                    .join(" ");
                  const permissionCount = Array.isArray(a.permissionsJson)
                    ? (a.permissionsJson as unknown[]).length
                    : 0;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                            {initialsFor(fullName, a.userProfile.email)}
                          </div>
                          <div>
                            <div className="text-sm font-medium">
                              {fullName || a.userProfile.email}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {a.userProfile.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {roleNameByKey.get(a.role) ?? a.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="muted">{permissionCount} perms</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {relativeTime(a.userProfile.lastSeenAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <CustomerUserActions
                          customerOrganizationId={org.id}
                          userProfileId={a.userProfileId}
                          email={a.userProfile.email}
                          currentRole={a.role}
                          currentStatus={a.status}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
