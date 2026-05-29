/**
 * /admin/subscriptions — every active or past Subscription, with the
 * customer org, package, billing cycle, and the next renewal date so
 * ops can see who's about to roll.
 */

import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import type { SubscriptionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  SubscriptionStatus,
  "default" | "secondary" | "outline" | "destructive" | "warning" | "success"
> = {
  active: "success",
  past_due: "destructive",
  cancelled: "outline",
  paused: "warning",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d);
}

export default async function SubscriptionsPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.SUBSCRIPTIONS_VIEW);

  const subs = await prisma.subscription.findMany({
    orderBy: [{ status: "asc" }, { currentPeriodEnd: "asc" }],
    take: 200,
    include: {
      customerOrganization: { select: { id: true, name: true, slug: true } },
      package: { select: { name: true, sku: true, billingCycle: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Recurring revenue and active customer subscriptions. Renewals roll automatically via QBO RecurringTransactions."
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current period</TableHead>
                <TableHead>Renews</TableHead>
                <TableHead>QBO Recurring</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No subscriptions yet. Recurring packages create one on first payment.
                  </TableCell>
                </TableRow>
              ) : null}
              {subs.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <Link
                      href={`/admin/customer-orgs/${sub.customerOrganization.id}`}
                      className="text-primary hover:underline"
                    >
                      {sub.customerOrganization.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{sub.package.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{sub.package.sku}</div>
                  </TableCell>
                  <TableCell className="capitalize">{sub.package.billingCycle.replace("_", " ")}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[sub.status]}>{sub.status.replace("_", " ")}</Badge>
                    {sub.cancelAtPeriodEnd ? (
                      <div className="mt-1 text-xs text-warning">cancels at period end</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(sub.currentPeriodStart)} → {formatDate(sub.currentPeriodEnd)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(sub.currentPeriodEnd)}</TableCell>
                  <TableCell>
                    {sub.qboRecurringTransactionId ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {sub.qboRecurringTransactionId}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
