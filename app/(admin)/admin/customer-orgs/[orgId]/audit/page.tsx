import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { AuditLogTable } from "@/components/tables/audit-log-table";

export const dynamic = "force-dynamic";

export default async function CustomerOrgAuditPage({
  params,
}: {
  params: { orgId: string };
}) {
  const org = await prisma.customerOrganization.findUnique({
    where: { id: params.orgId },
  });
  if (!org) notFound();

  const logs = await prisma.auditLog.findMany({
    where: { customerOrganizationId: org.id },
    orderBy: { timestamp: "desc" },
    take: 100,
    include: {
      customerOrganization: { select: { name: true } },
      app: { select: { appKey: true, name: true } },
    },
  });

  return (
    <Card>
      <CardContent className="p-0">
        <AuditLogTable rows={logs} />
      </CardContent>
    </Card>
  );
}
