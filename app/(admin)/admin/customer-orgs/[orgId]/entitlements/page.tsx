import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { EntitlementCard } from "@/components/forms/entitlement-form";

export const dynamic = "force-dynamic";

export default async function CustomerOrgEntitlementsPage({
  params,
}: {
  params: { orgId: string };
}) {
  const org = await prisma.customerOrganization.findUnique({
    where: { id: params.orgId },
  });
  if (!org) notFound();

  const [apps, entitlements] = await Promise.all([
    prisma.appRegistry.findMany({
      where: { isInternalOnly: false },
      orderBy: { name: "asc" },
    }),
    prisma.productEntitlement.findMany({
      where: { customerOrganizationId: org.id },
    }),
  ]);

  const byApp = new Map(entitlements.map((e) => [e.appRegistryId, e]));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {apps.map((app) => {
        const initial = byApp.get(app.id);
        return (
          <EntitlementCard
            key={app.id}
            customerOrganizationId={org.id}
            app={{
              id: app.id,
              name: app.name,
              appKey: app.appKey,
              description: app.description,
            }}
            initial={
              initial
                ? {
                    enabled: initial.enabled,
                    plan: initial.plan,
                    status: initial.status,
                    maxUsers: initial.maxUsers,
                    startsAt: initial.startsAt,
                    expiresAt: initial.expiresAt,
                    configurationJson: initial.configurationJson,
                  }
                : null
            }
          />
        );
      })}
    </div>
  );
}
