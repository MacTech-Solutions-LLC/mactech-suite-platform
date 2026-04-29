import {
  Building2,
  Users,
  ShieldCheck,
  Boxes,
  Siren,
  AlertTriangle,
  PackageSearch,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { DashboardMetricCard } from "@/components/cards/dashboard-metric-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { SeverityBadge } from "@/components/ui/severity-badge";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db/prisma";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    totalOrgs,
    activeOrgs,
    suspendedOrgs,
    totalUsers,
    activeEntitlements,
    securityOpen,
    criticalRecent,
    appsRegistered,
    recentAuditLogs,
    recentOrgs,
    appAdoption,
    severityBreakdown,
  ] = await Promise.all([
    prisma.customerOrganization.count(),
    prisma.customerOrganization.count({ where: { status: "active" } }),
    prisma.customerOrganization.count({ where: { status: "suspended" } }),
    prisma.userProfile.count(),
    prisma.productEntitlement.count({ where: { enabled: true, status: "active" } }),
    prisma.securityEvent.count({ where: { status: { in: ["open", "investigating"] } } }),
    prisma.auditLog.count({
      where: { severity: "critical", timestamp: { gte: sevenDaysAgo } },
    }),
    prisma.appRegistry.count({ where: { status: "active" } }),
    prisma.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 8,
      include: {
        customerOrganization: { select: { name: true, slug: true } },
        app: { select: { name: true, appKey: true } },
      },
    }),
    prisma.customerOrganization.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.productEntitlement.groupBy({
      by: ["appRegistryId"],
      where: { enabled: true },
      _count: { _all: true },
    }),
    prisma.securityEvent.groupBy({
      by: ["severity"],
      where: { status: { in: ["open", "investigating"] } },
      _count: { _all: true },
    }),
  ]);

  const apps = await prisma.appRegistry.findMany({
    where: { id: { in: appAdoption.map((a) => a.appRegistryId) } },
    select: { id: true, name: true, appKey: true },
  });
  const adoptionByApp = appAdoption
    .map((a) => ({
      app: apps.find((x) => x.id === a.appRegistryId),
      count: a._count._all,
    }))
    .filter((row) => row.app)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Command Center Dashboard"
        description="Real-time view of customer organizations, entitlements, and platform security posture across the MacTech Suite."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          label="Customer organizations"
          value={totalOrgs}
          delta={`${activeOrgs} active · ${suspendedOrgs} suspended`}
          icon={Building2}
        />
        <DashboardMetricCard
          label="Total users"
          value={totalUsers}
          delta="Across MacTech + customer tenants"
          icon={Users}
        />
        <DashboardMetricCard
          label="Active product entitlements"
          value={activeEntitlements}
          delta="Enabled & active across all customers"
          icon={Boxes}
          intent="success"
        />
        <DashboardMetricCard
          label="Apps registered"
          value={appsRegistered}
          delta="Active in the App Registry"
          icon={PackageSearch}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          label="Open security events"
          value={securityOpen}
          delta="Open or under investigation"
          icon={Siren}
          intent={securityOpen > 0 ? "destructive" : "success"}
        />
        <DashboardMetricCard
          label="Critical audit events (7d)"
          value={criticalRecent}
          delta="Severity = critical"
          icon={AlertTriangle}
          intent={criticalRecent > 0 ? "warning" : "default"}
        />
        <DashboardMetricCard
          label="Active customers"
          value={activeOrgs}
          delta="Status = active"
          icon={ShieldCheck}
          intent="success"
        />
        <DashboardMetricCard
          label="Suspended customers"
          value={suspendedOrgs}
          delta="Status = suspended"
          icon={ShieldCheck}
          intent={suspendedOrgs > 0 ? "warning" : "default"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Recent audit activity</CardTitle>
              <CardDescription>Latest 8 platform-wide events.</CardDescription>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Org</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAuditLogs.length === 0 ? (
                  <TableEmpty colSpan={5} message="No audit activity yet." />
                ) : (
                  recentAuditLogs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {relativeTime(row.timestamp)}
                      </TableCell>
                      <TableCell>
                        <SeverityBadge severity={row.severity} />
                      </TableCell>
                      <TableCell className="max-w-[28rem] truncate">{row.action}</TableCell>
                      <TableCell className="text-xs">
                        {row.actorEmail || "system"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.customerOrganization?.name || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent customer organizations</CardTitle>
            <CardDescription>Newest tenants onboarded.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentOrgs.length === 0 && (
              <p className="text-sm text-muted-foreground">No customer organizations yet.</p>
            )}
            {recentOrgs.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{org.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {org.subscriptionTier} · CMMC {org.cmmcTargetLevel}
                  </div>
                </div>
                <StatusBadge status={org.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Product adoption</CardTitle>
            <CardDescription>
              Customers with each app enabled (entitlement on).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {adoptionByApp.length === 0 && (
              <p className="text-sm text-muted-foreground">No entitlements yet.</p>
            )}
            {adoptionByApp.map(({ app, count }) => (
              <div key={app!.id} className="flex items-center justify-between">
                <div className="text-sm">{app!.name}</div>
                <Badge variant="outline">{count} customers</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open security events by severity</CardTitle>
            <CardDescription>Open or actively investigating.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {severityBreakdown.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No open security events. Posture is clean.
              </p>
            )}
            {severityBreakdown.map((row) => (
              <div key={row.severity} className="flex items-center justify-between">
                <SeverityBadge severity={row.severity} />
                <Badge variant="outline">{row._count._all}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-muted-foreground text-right">
        Generated {formatDateTime(new Date())}
      </p>
    </div>
  );
}
