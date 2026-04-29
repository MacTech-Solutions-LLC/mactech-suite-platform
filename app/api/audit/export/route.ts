import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getAuditLogs } from "@/lib/audit";
import type { AuditCategory, AuditSeverity } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET(request: NextRequest) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW);
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const severity = searchParams.get("severity");

  const { items } = await getAuditLogs({
    search: searchParams.get("q"),
    customerOrganizationId: searchParams.get("orgId"),
    appKey: searchParams.get("appKey"),
    eventCategory: CATEGORIES.includes((category ?? "") as AuditCategory)
      ? (category as AuditCategory)
      : null,
    severity: SEVERITIES.includes((severity ?? "") as AuditSeverity)
      ? (severity as AuditSeverity)
      : null,
    actorEmail: searchParams.get("actorEmail"),
    startDate: searchParams.get("start") ? new Date(searchParams.get("start")!) : null,
    endDate: searchParams.get("end") ? new Date(searchParams.get("end")!) : null,
    take: 10000,
  });

  const header = [
    "id",
    "timestamp",
    "severity",
    "category",
    "eventType",
    "action",
    "actorEmail",
    "customerOrg",
    "app",
    "resourceType",
    "resourceId",
  ];

  const rows = items.map((row) =>
    [
      row.id,
      row.timestamp.toISOString(),
      row.severity,
      row.eventCategory,
      row.eventType,
      row.action,
      row.actorEmail ?? "",
      row.customerOrganization?.name ?? "",
      row.app?.appKey ?? "",
      row.resourceType ?? "",
      row.resourceId ?? "",
    ]
      .map(escapeCsv)
      .join(","),
  );

  const body = [header.join(","), ...rows].join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mactech-audit-${Date.now()}.csv"`,
    },
  });
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
