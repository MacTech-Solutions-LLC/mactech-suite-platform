/**
 * Helpers for emitting auditor-access events into the local AuditLog.
 * Mirrors the central pattern in lib/audit.ts so /admin/audit-logs picks
 * the events up alongside everything else (filterable by appKey=enclavewatch
 * downstream, since the upstream sibling forwards the matching event with
 * that appKey).
 */

import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";

export interface AuditorAccessEventInput {
  eventType:
    | "auditor_access.grant.requested"
    | "auditor_access.grant.created"
    | "auditor_access.grant.failed"
    | "auditor_access.grant.revoked"
    | "auditor_access.grant.extended";
  severity: "info" | "warning" | "critical";
  action: string;
  actorClerkUserId: string;
  actorEmail: string;
  actorUserProfileId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
  resourceId: string | null; // grantId once known
  metadata: Record<string, unknown>;
}

export async function emitAuditorAccessEvent(input: AuditorAccessEventInput) {
  await writeAuditLog({
    eventType: input.eventType,
    eventCategory: "auth",
    severity: input.severity,
    action: input.action,
    actorClerkUserId: input.actorClerkUserId,
    actorEmail: input.actorEmail,
    actorUserProfileId: input.actorUserProfileId,
    customerOrganizationId: null,
    appRegistryId: null, // Not tied to an AppRegistry row; this is platform-level
    resourceType: input.resourceId ? "auditor_access_grant" : "auditor_access_request",
    resourceId: input.resourceId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    requestId: input.requestId,
    metadata: input.metadata as Prisma.InputJsonValue,
  });
}
