import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { EntitlementCard } from "@/components/forms/entitlement-form";
import { BulkEntitlementsButton } from "@/components/forms/bulk-entitlements-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  const enabledCount = entitlements.filter((e) => e.enabled).length;
  const disabledAppIds = apps
    .filter((a) => {
      const e = byApp.get(a.id);
      return !e || !e.enabled;
    })
    .map((a) => a.id);
  const enabledAppIds = apps
    .filter((a) => byApp.get(a.id)?.enabled)
    .map((a) => a.id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>
              {enabledCount} of {apps.length} apps enabled
            </CardTitle>
            <CardDescription>
              Toggle individual entitlements per app below — plan, seat cap,
              expiration, and configuration JSON are editable inline. Or use
              the bulk controls to flip everything at once.
            </CardDescription>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {entitlements
                .filter((e) => e.enabled)
                .map((e) => {
                  const app = apps.find((a) => a.id === e.appRegistryId);
                  if (!app) return null;
                  return (
                    <Badge
                      key={e.id}
                      variant="success"
                      className="font-mono text-[10px]"
                    >
                      {app.appKey} · {e.plan}
                    </Badge>
                  );
                })}
              {enabledCount === 0 && (
                <span className="text-xs text-muted-foreground">
                  No apps enabled yet.
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <BulkEntitlementsButton
              customerOrganizationId={org.id}
              appRegistryIds={disabledAppIds}
              appCount={disabledAppIds.length}
              enable
              customerOrgName={org.name}
            />
            <BulkEntitlementsButton
              customerOrganizationId={org.id}
              appRegistryIds={enabledAppIds}
              appCount={enabledAppIds.length}
              enable={false}
              customerOrgName={org.name}
            />
          </div>
        </CardHeader>
      </Card>

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
    </div>
  );
}
