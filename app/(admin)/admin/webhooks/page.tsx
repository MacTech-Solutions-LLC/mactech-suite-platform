import { PageHeader } from "@/components/layout/admin-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { CreateWebhookForm } from "@/components/forms/create-webhook-form";
import { WebhookRowActions } from "@/components/forms/webhook-row-actions";
import { WebhookDeliveryRetryButton } from "@/components/forms/webhook-delivery-retry-button";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);

  const [subscriptions, recentDeliveries, orgs] = await Promise.all([
    prisma.webhookSubscription.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { customerOrganization: { select: { name: true } } },
    }),
    prisma.webhookDelivery.findMany({
      orderBy: { scheduledAt: "desc" },
      take: 25,
      include: { subscription: { select: { name: true, url: true } } },
    }),
    prisma.customerOrganization.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Outgoing event subscriptions for sibling apps. Each delivery is signed with HMAC-SHA256 and retried with exponential backoff up to 5 attempts."
        actions={<CreateWebhookForm orgs={orgs} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
          <CardDescription>
            Match by exact event name (e.g. <span className="font-mono">entitlement.enabled</span>)
            or wildcard prefix (e.g. <span className="font-mono">customer_org.*</span>).
            Org-scoped subscriptions only fire when the event&apos;s org matches.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last success</TableHead>
                <TableHead>Failures</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.length === 0 ? (
                <TableEmpty
                  colSpan={8}
                  message="No subscriptions yet. Click 'New webhook' to add one."
                />
              ) : (
                subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      {s.appKey && (
                        <Badge variant="muted" className="font-mono text-[10px] mt-1">
                          {s.appKey}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs break-all max-w-xs">
                      {s.url}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.customerOrganization?.name ?? (
                        <span className="text-muted-foreground">all orgs</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {s.events.slice(0, 3).map((e) => (
                          <Badge key={e} variant="outline" className="font-mono text-[10px]">
                            {e}
                          </Badge>
                        ))}
                        {s.events.length > 3 && (
                          <Badge variant="muted" className="text-[10px]">
                            +{s.events.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.status === "active"
                            ? "success"
                            : s.status === "paused"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(s.lastSuccessAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.failureCount > 0 ? (
                        <Badge variant="destructive">{s.failureCount}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <WebhookRowActions
                        id={s.id}
                        name={s.name}
                        status={s.status}
                      />
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
          <CardTitle>Recent deliveries</CardTitle>
          <CardDescription>Latest 25 attempts across all subscriptions.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Response</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentDeliveries.length === 0 ? (
                <TableEmpty colSpan={7} message="No deliveries yet." />
              ) : (
                recentDeliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDateTime(d.scheduledAt)}
                    </TableCell>
                    <TableCell className="text-xs">{d.subscription.name}</TableCell>
                    <TableCell className="font-mono text-xs">{d.eventType}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          d.status === "delivered"
                            ? "success"
                            : d.status === "pending"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.responseStatus ? (
                        <code className="font-mono">HTTP {d.responseStatus}</code>
                      ) : d.errorMessage ? (
                        <span className="text-destructive truncate inline-block max-w-xs">
                          {d.errorMessage}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{d.attemptCount}</TableCell>
                    <TableCell className="text-right">
                      <WebhookDeliveryRetryButton
                        deliveryId={d.id}
                        status={d.status}
                      />
                    </TableCell>
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
