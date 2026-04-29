import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { UserTable } from "@/components/tables/user-table";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
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

  const profiles = await prisma.userProfile.findMany({
    where: { isInternalMacTechUser: true },
    orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
  });

  const rows = profiles.map((p) => ({
    id: p.id,
    email: p.email,
    name: [p.firstName, p.lastName].filter(Boolean).join(" "),
    role: platformRoleLabel(p.platformRole),
    platformRole: p.platformRole,
    status: p.status,
    lastSeenAt: p.lastSeenAt,
    isInternal: p.isInternalMacTechUser,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="MacTech Admins"
        description="Internal MacTech employees with platform-level authority across the suite."
      />

      <Alert variant="info">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Promoting users</AlertTitle>
        <AlertDescription>
          To grant a user platform access, set their{" "}
          <span className="font-mono">isInternalMacTechUser</span> flag and
          platform role on their UserProfile (via SQL, seed, or a future
          settings UI). All role changes are recorded in the central audit log.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-0">
          <UserTable rows={rows} kind="platform" />
        </CardContent>
      </Card>
    </div>
  );
}
