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

// Maximum rows to export per request. This prevents memory exhaustion
// when exporting large datasets. Clients should paginate using date range parameters.
const MAX_EXPORT_ROWS = 10000;

export async function GET(request: NextRequest) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW);
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const severity = searchParams.get("severity");

  try {
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
      take: MAX_EXPORT_ROWS,
    });

    if (items.length === MAX_EXPORT_ROWS) {
      console.warn("[audit/export] Export hit row limit; consider narrower date range", {
        limit: MAX_EXPORT_ROWS,
        filters: { category, severity, search: searchParams.get("q") },
      });
    }

    const header = [
      "id",
      "sequenceNumber",
      "timestamp",
      "previousHash",
      "currentHash",
      "canonicalPayloadHash",
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
        String(row.sequenceNumber),
        row.timestamp.toISOString(),
        row.previousHash,
        row.currentHash,
        row.canonicalPayloadHash,
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
  } catch (error) {
    console.error("[audit/export] Export failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "export_failed",
        message: "Failed to export audit logs. Please try with narrower filters.",
      },
      { status: 500 }
    );
  }
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
