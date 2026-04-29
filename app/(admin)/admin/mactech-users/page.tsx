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
import { PlatformUserActions } from "@/components/forms/platform-user-actions";
import { initialsFor, relativeTime } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";
import {
  requirePlatformPermission,
  getCurrentAuthContext,
} from "@/lib/authz";
import { PLATFORM_PERMISSIONS, platformRoleLabel } from "@/lib/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MacTechUsersPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.MACTECH_USERS_MANAGE);
  const ctx = await getCurrentAuthContext();
  const selfId = ctx?.userProfile.id;

  const profiles = await prisma.userProfile.findMany({
    where: { isInternalMacTechUser: true },
    orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="MacTech Admins"
        description="Internal MacTech employees with platform-level authority across the suite."
      />

      <Alert variant="info">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Promotions are audited</AlertTitle>
        <AlertDescription>
          Use the row menu to change a user&apos;s platform role or suspend
          access. Every change is recorded in the central audit log. To grant
          platform access to a user who is not yet internal, find them under{" "}
          <span className="font-mono">/admin/users</span> and use the row menu
          there.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Platform role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 ? (
                <TableEmpty colSpan={5} message="No MacTech admins yet." />
              ) : (
                profiles.map((p) => {
                  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ");
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                            {initialsFor(fullName, p.email)}
                          </div>
                          <div>
                            <div className="text-sm font-medium">
                              {fullName || p.email}
                              {p.id === selfId && (
                                <Badge variant="outline" className="ml-2 text-[10px]">
                                  you
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">
                          {platformRoleLabel(p.platformRole)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {relativeTime(p.lastSeenAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <PlatformUserActions
                          userProfileId={p.id}
                          email={p.email}
                          isSelf={p.id === selfId}
                          currentRole={p.platformRole}
                          currentStatus={p.status}
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
