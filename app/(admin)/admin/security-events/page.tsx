import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { SecurityEventDetailButton } from "@/components/drawers/security-event-detail-drawer";
import { SecurityEventRowActions } from "@/components/security-events/security-event-row-actions";
import { formatDateTime } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import type { Prisma, SecurityEventStatus, SecuritySeverity } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES: SecurityEventStatus[] = ["open", "investigating", "resolved", "ignored"];
const SEVERITIES: SecuritySeverity[] = ["low", "medium", "high", "critical"];

export default async function SecurityEventsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.SECURITY_EVENTS_VIEW);

  const q = readParam(searchParams, "q");
  const status = readParam(searchParams, "status");
  const severity = readParam(searchParams, "severity");
  const orgId = readParam(searchParams, "orgId");
  const appKey = readParam(searchParams, "appKey");

  const where: Prisma.SecurityEventWhereInput = {};
  if (q) {
    where.OR = [
      { eventType: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status && (STATUSES as string[]).includes(status))
    where.status = status as SecurityEventStatus;
  if (severity && (SEVERITIES as string[]).includes(severity))
    where.severity = severity as SecuritySeverity;
  if (orgId) where.customerOrganizationId = orgId;
  if (appKey) where.sourceAppKey = appKey;

  const [events, orgs, apps] = await Promise.all([
    prisma.securityEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 100,
      include: { customerOrganization: { select: { name: true } } },
    }),
    prisma.customerOrganization.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.appRegistry.findMany({
      select: { appKey: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security events"
        description="Triage and resolve potential security incidents across the suite."
      />

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-6" method="get">
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                name="q"
                placeholder="Event type or description"
                defaultValue={q ?? ""}
              />
            </div>
            <FilterSelect
              id="status"
              label="Status"
              defaultValue={status ?? "any"}
              options={["any", ...STATUSES]}
            />
            <FilterSelect
              id="severity"
              label="Severity"
              defaultValue={severity ?? "any"}
              options={["any", ...SEVERITIES]}
            />
            <FilterSelect
              id="orgId"
              label="Customer org"
              defaultValue={orgId ?? "any"}
              options={[
                { value: "any", label: "any" },
                ...orgs.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
            <FilterSelect
              id="appKey"
              label="App"
              defaultValue={appKey ?? "any"}
              options={[
                { value: "any", label: "any" },
                ...apps.map((a) => ({ value: a.appKey, label: a.name })),
              ]}
            />
            <div className="md:col-span-6 flex justify-end">
              <button
                type="submit"
                className="text-xs underline-offset-2 hover:underline text-muted-foreground"
              >
                Apply filters
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableEmpty colSpan={7} message="No security events match." />
              ) : (
                events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDateTime(event.timestamp)}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={event.severity} />
                    </TableCell>
                    <TableCell className="text-sm">{event.eventType}</TableCell>
                    <TableCell className="max-w-[24rem] truncate text-sm">
                      {event.description}
                    </TableCell>
                    <TableCell className="text-xs">
                      {event.customerOrganization?.name || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={event.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <SecurityEventRowActions
                          eventId={event.id}
                          status={event.status}
                        />
                        <SecurityEventDetailButton
                          row={{
                            id: event.id,
                            timestamp: event.timestamp,
                            eventType: event.eventType,
                            severity: event.severity,
                            status: event.status,
                            description: event.description,
                            sourceAppKey: event.sourceAppKey,
                            metadataJson: event.metadataJson,
                            customerOrganization: event.customerOrganization,
                          }}
                        />
                      </div>
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

function readParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  if (!searchParams) return null;
  const v = searchParams[key];
  if (typeof v === "string" && v.length > 0 && v !== "any") return v;
  return null;
}

function FilterSelect({
  id,
  label,
  options,
  defaultValue,
}: {
  id: string;
  label: string;
  options: Array<string | { value: string; label: string }>;
  defaultValue: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select name={id} defaultValue={defaultValue}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => {
            const value = typeof o === "string" ? o : o.value;
            const label = typeof o === "string" ? o.replace(/_/g, " ") : o.label;
            return (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
