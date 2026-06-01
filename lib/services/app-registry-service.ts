"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  upsertAppSchema,
  deleteAppSchema,
  type UpsertAppInput,
  type DeleteAppInput,
} from "@/lib/validations/app-registry";
import { writeAuditLog, writeSecurityEvent } from "@/lib/audit";
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

/**
 * Step-up MFA gate for sensitive registry mutations.
 *
 * "Clerk owns MFA" — so rather than minting our own second factor we ask the
 * admin to produce a fresh TOTP (or backup) code and verify it against Clerk's
 * backend. The session alone is never enough authority to delete an app:
 *  1. the admin must actually have MFA enrolled, and
 *  2. the supplied code must verify right now.
 * Throws a user-facing Error on any failure so the caller can surface it.
 */
async function assertMfaApproval(clerkUserId: string, code: string) {
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();

  const user = await client.users.getUser(clerkUserId);
  if (!user.twoFactorEnabled) {
    throw new Error(
      "Multi-factor authentication is required to delete an app. Enable MFA on your account in Clerk, then try again.",
    );
  }

  try {
    await client.users.verifyTOTP({ userId: clerkUserId, code });
  } catch {
    throw new Error("That MFA code was not valid. Deletion was not approved.");
  }
}

export async function deleteApp(rawInput: DeleteAppInput) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.APP_REGISTRY_MANAGE);
  const input = deleteAppSchema.parse(rawInput);

  const app = await prisma.appRegistry.findUnique({
    where: { appKey: input.appKey },
    include: {
      _count: {
        select: {
          entitlements: true,
          sourceObjectRefs: true,
          ownedObjectRefs: true,
          repoLinks: true,
          outgoingDependencies: true,
          incomingDependencies: true,
        },
      },
    },
  });

  if (!app) {
    throw new Error("That app no longer exists in the registry.");
  }
  if (input.confirmAppKey !== app.appKey) {
    throw new Error("The confirmation does not match the app key.");
  }

  // Suite object references hang off appKey with a restrictive FK, so the row
  // cannot be removed while any exist. Catch this up front with a clear message
  // instead of letting the delete fail with an opaque constraint error.
  const blockingReferences = app._count.sourceObjectRefs + app._count.ownedObjectRefs;
  if (blockingReferences > 0) {
    throw new Error(
      `Cannot delete ${app.name}: it is still referenced by ${blockingReferences} suite object reference(s). Reassign or remove those first.`,
    );
  }

  // Require a fresh MFA challenge before the destructive step.
  await assertMfaApproval(ctx.clerkUserId, input.mfaCode);

  try {
    await prisma.appRegistry.delete({ where: { id: app.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw new Error(
        `Cannot delete ${app.name}: it is still referenced by other records. Resolve those references first.`,
      );
    }
    throw err;
  }

  await writeAuditLog({
    eventType: "app_registry.deleted",
    eventCategory: "system",
    severity: "warning",
    action: `Deleted app ${app.name} (${app.appKey}) from the registry`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "AppRegistry",
    resourceId: app.id,
    metadata: {
      appKey: app.appKey,
      status: app.status,
      category: app.category,
      mfaApproved: true,
      removedEntitlements: app._count.entitlements,
      removedRepoLinks: app._count.repoLinks,
      removedDependencyEdges:
        app._count.outgoingDependencies + app._count.incomingDependencies,
    },
  });

  await writeSecurityEvent({
    eventType: "app_registry.deleted",
    severity: "high",
    description: `MFA-approved deletion of app ${app.name} (${app.appKey}) by ${ctx.userProfile.email}`,
    actorClerkUserId: ctx.clerkUserId,
    sourceAppKey: "hub",
    metadata: {
      appKey: app.appKey,
      removedEntitlements: app._count.entitlements,
    },
  });

  return { ok: true as const, appKey: app.appKey, name: app.name };
}
