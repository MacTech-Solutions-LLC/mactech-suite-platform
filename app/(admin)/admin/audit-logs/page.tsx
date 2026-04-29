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
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import Link from "next/link";
import { AuditLogTable } from "@/components/tables/audit-log-table";
import { Pagination, buildHrefForPage } from "@/components/ui/pagination";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getAuditLogs } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import type { AuditCategory, AuditSeverity } from "@prisma/client";

export const dynamic = "force-dynamic";

const CATEGORIES: AuditCategory[] = [
  "auth",
  "user",
  "org",
  "entitlement",
  "role",
  "security",
  "vault",
  "evidence",
  "boundary",
  "capture",
  "system",
];
const SEVERITIES: AuditSeverity[] = ["info", "warning", "critical"];

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW);

  const search = readParam(searchParams, "q");
  const orgIdRaw = readParam(searchParams, "orgId");
  const appKey = readParam(searchParams, "appKey");
  const category = readParam(searchParams, "category");
  const severity = readParam(searchParams, "severity");
  const actorEmail = readParam(searchParams, "actorEmail");
  const startDate = readParam(searchParams, "start");
  const endDate = readParam(searchParams, "end");
  const PAGE_SIZE = 50;
  const page = Math.max(1, Number(readParam(searchParams, "page") ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const orgs = await prisma.customerOrganization.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const apps = await prisma.appRegistry.findMany({
    select: { appKey: true, name: true },
    orderBy: { name: "asc" },
  });

  const { items, total } = await getAuditLogs({
    search: search ?? null,
    customerOrganizationId: orgIdRaw ?? null,
    appKey: appKey ?? null,
    eventCategory: (CATEGORIES.includes((category ?? "") as AuditCategory)
      ? (category as AuditCategory)
      : null),
    severity: (SEVERITIES.includes((severity ?? "") as AuditSeverity)
      ? (severity as AuditSeverity)
      : null),
    actorEmail: actorEmail ?? null,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    take: PAGE_SIZE,
    skip,
  });

  const exportParams = new URLSearchParams();
  if (search) exportParams.set("q", search);
  if (orgIdRaw) exportParams.set("orgId", orgIdRaw);
  if (appKey) exportParams.set("appKey", appKey);
  if (category) exportParams.set("category", category);
  if (severity) exportParams.set("severity", severity);
  if (actorEmail) exportParams.set("actorEmail", actorEmail);
  if (startDate) exportParams.set("start", startDate);
  if (endDate) exportParams.set("end", endDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central audit logs"
        description="Immutable record of every platform action and ingested app event."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/audit/export?${exportParams.toString()}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-6" method="get">
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                name="q"
                placeholder="Action, actor, resource"
                defaultValue={search ?? ""}
              />
            </div>
            <FilterSelect
              id="category"
              label="Category"
              defaultValue={category ?? "any"}
              options={["any", ...CATEGORIES]}
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
              defaultValue={orgIdRaw ?? "any"}
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
            <div className="grid gap-1.5">
              <Label htmlFor="actorEmail">Actor email</Label>
              <Input
                id="actorEmail"
                name="actorEmail"
                placeholder="contains…"
                defaultValue={actorEmail ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="start">From</Label>
              <Input id="start" name="start" type="date" defaultValue={startDate ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="end">To</Label>
              <Input id="end" name="end" type="date" defaultValue={endDate ?? ""} />
            </div>
            <div className="md:col-span-6 flex justify-end gap-2">
              <Link
                className="text-xs underline-offset-2 hover:underline text-muted-foreground"
                href="/admin/audit-logs"
              >
                Reset
              </Link>
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
          <AuditLogTable rows={items} />
        </CardContent>
      </Card>

      <Pagination
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        hrefForPage={(p) => buildHrefForPage("/admin/audit-logs", searchParams, p)}
      />
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

