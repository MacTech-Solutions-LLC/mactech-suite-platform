"use server";

import { prisma } from "@/lib/db/prisma";
import {
  updateSecurityEventStatusSchema,
  type UpdateSecurityEventStatusInput,
} from "@/lib/validations/security-event";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export async function updateSecurityEventStatus(
  rawInput: UpdateSecurityEventStatusInput,
) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.SECURITY_EVENTS_VIEW);
  const input = updateSecurityEventStatusSchema.parse(rawInput);

  const previous = await prisma.securityEvent.findUnique({ where: { id: input.id } });
  if (!previous) throw new Error("Security event not found.");

  const updated = await prisma.securityEvent.update({
    where: { id: input.id },
    data: { status: input.status },
  });

  await writeAuditLog({
    eventType: `security_event.${input.status}`,
    eventCategory: "security",
    severity:
      input.status === "resolved" || input.status === "ignored" ? "info" : "warning",
    action: `Set security event ${previous.eventType} to ${input.status}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: previous.customerOrganizationId ?? null,
    resourceType: "SecurityEvent",
    resourceId: previous.id,
    metadata: { from: previous.status, to: input.status, note: input.note },
  });

  return updated;
}
