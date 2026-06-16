"use server";

import { prisma } from "@/lib/db/prisma";
import {
  upsertEntitlementSchema,
  quickToggleEntitlementSchema,
  bulkSetEntitlementsSchema,
  type UpsertEntitlementInput,
  type QuickToggleEntitlementInput,
  type BulkSetEntitlementsInput,
} from "@/lib/validations/entitlement";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  buildPublicMetadata,
  tryClerk,
  updateClerkOrg,
} from "./clerk-org-service";
import { dispatchWebhookEvent } from "./webhook-service";

export async function upsertProductEntitlement(rawInput: UpsertEntitlementInput) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.ENTITLEMENTS_MANAGE);
  const input = upsertEntitlementSchema.parse(rawInput);

  const [org, app] = await Promise.all([
    prisma.customerOrganization.findUnique({
      where: { id: input.customerOrganizationId },
    }),
    prisma.appRegistry.findUnique({ where: { id: input.appRegistryId } }),
  ]);
  if (!org || !app) throw new Error("Customer organization or app not found.");

  const previous = await prisma.productEntitlement.findUnique({
    where: {
      customerOrganizationId_appRegistryId: {
        customerOrganizationId: input.customerOrganizationId,
        appRegistryId: input.appRegistryId,
      },
    },
  });

  const updated = await prisma.productEntitlement.upsert({
    where: {
      customerOrganizationId_appRegistryId: {
        customerOrganizationId: input.customerOrganizationId,
        appRegistryId: input.appRegistryId,
      },
    },
    update: {
      enabled: input.enabled,
      plan: input.plan,
      maxUsers: input.maxUsers ?? null,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      status: input.status,
      configurationJson: (input.configurationJson as object | undefined) ?? undefined,
    },
    create: {
      customerOrganizationId: input.customerOrganizationId,
      appRegistryId: input.appRegistryId,
      enabled: input.enabled,
      plan: input.plan,
      maxUsers: input.maxUsers ?? null,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      status: input.status,
      configurationJson: (input.configurationJson as object | undefined) ?? undefined,
    },
  });

  const verb = previous
    ? input.enabled === previous.enabled
      ? "Updated"
      : input.enabled
        ? "Enabled"
        : "Disabled"
    : input.enabled
      ? "Enabled"
      : "Disabled";

  // Refresh Clerk publicMetadata so sibling apps see the new enabledApps
  // list immediately (no need to hit our /api/v1/orgs endpoint). Best-effort.
  let clerkSyncOk = true;
  if (org.clerkOrgId) {
    const enabled = await prisma.productEntitlement.findMany({
      where: { customerOrganizationId: org.id, enabled: true },
      include: { app: { select: { appKey: true } } },
    });
    const result = await tryClerk("updateOrganization (entitlements)", () =>
      updateClerkOrg({
        clerkOrgId: org.clerkOrgId!,
        publicMetadata: buildPublicMetadata(org, enabled),
      }),
    );
    clerkSyncOk = result.ok;
  }

  const eventType = input.enabled
    ? previous
      ? "entitlement.updated"
      : "entitlement.enabled"
    : "entitlement.disabled";

  const auditEntry = await writeAuditLog({
    eventType,
    eventCategory: "entitlement",
    severity: input.enabled ? "info" : "warning",
    action: `${verb} ${app.name} entitlement for ${org.name}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: org.id,
    appRegistryId: app.id,
    resourceType: "ProductEntitlement",
    resourceId: updated.id,
    metadata: {
      appKey: app.appKey,
      plan: input.plan,
      previousPlan: previous?.plan,
      previousStatus: previous?.status,
      newStatus: input.status,
      clerkSyncOk,
    },
  });

  // Fire-and-forget webhook dispatch — failures don't block the mutation.
  if (auditEntry) {
    void dispatchWebhookEvent({
      eventType,
      eventId: auditEntry.id,
      customerOrganizationId: org.id,
      payload: {
        appKey: app.appKey,
        appName: app.name,
        enabled: input.enabled,
        plan: input.plan,
        status: input.status,
        maxUsers: input.maxUsers ?? null,
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        previousPlan: previous?.plan ?? null,
        previousStatus: previous?.status ?? null,
        customerOrgClerkId: org.clerkOrgId,
        customerOrgName: org.name,
      },
    });
  }

  return updated;
}

/**
 * One-click toggle of an entitlement from the matrix view. When enabling
 * an entitlement that has never existed, default to plan="starter" and
 * status="active". When disabling, preserve the plan but mark the row
 * disabled+suspended so the historical configuration is recoverable.
 *
 * Routes through the same upsertProductEntitlement path so audit + Clerk
 * publicMetadata refresh + webhook dispatch all happen automatically.
 */
export async function quickToggleEntitlement(rawInput: QuickToggleEntitlementInput) {
  const input = quickToggleEntitlementSchema.parse(rawInput);
  const previous = await prisma.productEntitlement.findUnique({
    where: {
      customerOrganizationId_appRegistryId: {
        customerOrganizationId: input.customerOrganizationId,
        appRegistryId: input.appRegistryId,
      },
    },
    select: {
      plan: true,
      maxUsers: true,
      startsAt: true,
      expiresAt: true,
      configurationJson: true,
    },
  });

  return upsertProductEntitlement({
    customerOrganizationId: input.customerOrganizationId,
    appRegistryId: input.appRegistryId,
    enabled: input.enabled,
    plan: previous?.plan ?? (input.enabled ? "starter" : "none"),
    status: input.enabled ? "active" : "suspended",
    maxUsers: previous?.maxUsers ?? undefined,
    startsAt: previous?.startsAt ?? undefined,
    expiresAt: previous?.expiresAt ?? undefined,
    configurationJson: previous?.configurationJson ?? undefined,
  });
}

/**
 * Bulk-flip every (org × app) cell in one shot. Used by the
 * "Enable all apps" / "Disable all apps" controls on the per-org
 * entitlements page. Each underlying upsert audits + dispatches
 * separately so the central log + sibling apps see fine-grained events.
 */
export async function bulkSetEntitlements(rawInput: BulkSetEntitlementsInput) {
  const input = bulkSetEntitlementsSchema.parse(rawInput);
  const results: Array<{ appRegistryId: string; ok: boolean; error?: string }> = [];
  for (const appRegistryId of input.appRegistryIds) {
    try {
      await quickToggleEntitlement({
        customerOrganizationId: input.customerOrganizationId,
        appRegistryId,
        enabled: input.enabled,
      });
      results.push({ appRegistryId, ok: true });
    } catch (err) {
      results.push({
        appRegistryId,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return { results };
}
