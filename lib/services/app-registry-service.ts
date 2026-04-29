"use server";

import { prisma } from "@/lib/db/prisma";
import { upsertAppSchema, type UpsertAppInput } from "@/lib/validations/app-registry";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export async function upsertApp(rawInput: UpsertAppInput) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.APP_REGISTRY_MANAGE);
  const input = upsertAppSchema.parse(rawInput);

  const previous = await prisma.appRegistry.findUnique({ where: { appKey: input.appKey } });

  const app = await prisma.appRegistry.upsert({
    where: { appKey: input.appKey },
    update: {
      name: input.name,
      description: input.description || null,
      baseUrl: input.baseUrl || null,
      category: input.category,
      status: input.status,
      requiresOrgContext: input.requiresOrgContext,
      isInternalOnly: input.isInternalOnly,
    },
    create: {
      appKey: input.appKey,
      name: input.name,
      description: input.description || null,
      baseUrl: input.baseUrl || null,
      category: input.category,
      status: input.status,
      requiresOrgContext: input.requiresOrgContext,
      isInternalOnly: input.isInternalOnly,
    },
  });

  await writeAuditLog({
    eventType: previous ? "app_registry.updated" : "app_registry.created",
    eventCategory: "system",
    severity: "info",
    action: `${previous ? "Updated" : "Registered"} app ${app.name} (${app.appKey})`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    appRegistryId: app.id,
    resourceType: "AppRegistry",
    resourceId: app.id,
    metadata: {
      appKey: app.appKey,
      status: app.status,
      category: app.category,
      previousStatus: previous?.status,
    },
  });

  return app;
}
