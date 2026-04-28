import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
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
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CustomerOrgOverviewPage({
  params,
}: {
  params: { orgId: string };
}) {
  const org = await prisma.customerOrganization.findUnique({
    where: { id: params.orgId },
    include: {
      entitlements: { include: { app: true } },
      orgUserAccess: { include: { userProfile: true } },
    },
  });
  if (!org) notFound();

  const [recentAudit, recentSecurity] = await Promise.all([
    prisma.auditLog.findMany({
      where: { customerOrganizationId: org.id },
      orderBy: { timestamp: "desc" },
      take: 6,
      include: { app: { select: { appKey: true, name: true } } },
    }),
    prisma.securityEvent.findMany({
      where: { customerOrganizationId: org.id },
      orderBy: { timestamp: "desc" },
      take: 4,
    }),
  ]);

  const enabledEntitlements = org.entitlements.filter((e) => e.enabled);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Organization metadata</CardTitle>
          <CardDescription>Customer profile, compliance posture, and contacts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <Row label="Subscription tier" value={org.subscriptionTier} />
          <Row label="Status" value={<StatusBadge status={org.status} />} />
          <Row label="CMMC target level" value={org.cmmcTargetLevel} />
          <Row label="CUI boundary type" value={org.cuiBoundaryType.replace(/_/g, " ")} />
          <Row label="Customer type" value={org.customerType} />
          <Row label="Industry" value={org.industry || "—"} />
          <Row label="Domain" value={org.domain || "—"} />
          <Row label="CAGE code" value={org.cageCode || "—"} />
          <Row label="UEI" value={org.uei || "—"} />
          <Row label="DUNS" value={org.duns || "—"} />
          <Row label="Primary contact" value={org.primaryContactName || "—"} />
          <Row label="Primary contact email" value={org.primaryContactEmail || "—"} />
          <Row label="Created" value={formatDateTime(org.createdAt)} />
          <Row label="Updated" value={formatDateTime(org.updatedAt)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Internal notes</CardTitle>
          <CardDescription>Visible only to MacTech admins.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">
          {org.notes || "No internal notes recorded."}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Enabled apps</CardTitle>
          <CardDescription>
            Apps that the customer is currently entitled to launch.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {enabledEntitlements.length === 0 && (
            <p className="text-sm text-muted-foreground">No apps enabled yet.</p>
          )}
          {enabledEntitlements.map((entitlement) => (
            <div
              key={entitlement.id}
              className="rounded-md border border-border p-3"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{entitlement.app.name}</div>
                <StatusBadge status={entitlement.status} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {entitlement.plan} plan ·{" "}
                {entitlement.maxUsers ? `${entitlement.maxUsers} seats` : "no seat cap"}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`/app-launch/${entitlement.app.appKey}?orgId=${org.id}`}
                  >
                    Launch <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
                <Badge variant="muted">{entitlement.app.appKey}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent security events</CardTitle>
          <CardDescription>Latest 4 events for this customer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentSecurity.length === 0 && (
            <p className="text-sm text-muted-foreground">No recent events.</p>
          )}
          {recentSecurity.map((event) => (
            <div
              key={event.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{event.eventType}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {event.description}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {relativeTime(event.timestamp)}
                </div>
              </div>
              <SeverityBadge severity={event.severity} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Recent audit activity</CardTitle>
          <CardDescription>Most recent audit log entries scoped to this organization.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>App</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentAudit.length === 0 ? (
                <TableEmpty colSpan={5} message="No audit activity yet." />
              ) : (
                recentAudit.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {relativeTime(row.timestamp)}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={row.severity} />
                    </TableCell>
                    <TableCell className="max-w-[28rem] truncate">{row.action}</TableCell>
                    <TableCell className="text-xs">{row.actorEmail || "system"}</TableCell>
                    <TableCell className="text-xs">{row.app?.appKey || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm capitalize">{value}</div>
    </div>
  );
}
