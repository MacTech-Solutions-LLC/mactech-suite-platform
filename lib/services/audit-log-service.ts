"use server";

import { getAuditLogs, type AuditLogFilters } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export async function listAuditLogs(filters: AuditLogFilters) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW);
  return getAuditLogs(filters);
}
