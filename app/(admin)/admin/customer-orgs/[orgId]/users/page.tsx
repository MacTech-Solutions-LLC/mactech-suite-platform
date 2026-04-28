import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { InviteUserForm } from "@/components/forms/invite-user-form";
import { UserTable } from "@/components/tables/user-table";
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

  const rows = accesses.map((a) => ({
    id: a.id,
    email: a.userProfile.email,
    name: [a.userProfile.firstName, a.userProfile.lastName].filter(Boolean).join(" "),
    role: a.role,
    status: a.status,
    lastSeenAt: a.userProfile.lastSeenAt,
    permissions: Array.isArray(a.permissionsJson)
      ? (a.permissionsJson as unknown[]).length
      : 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <InviteUserForm
          customerOrganizationId={org.id}
          customerRoles={CUSTOMER_ROLE_DEFINITIONS.map((r) => ({ key: r.key, name: r.name }))}
          apps={apps}
        />
      </div>
      <Card>
        <CardContent className="p-0">
          <UserTable rows={rows} kind="org" />
        </CardContent>
      </Card>
    </div>
  );
}
