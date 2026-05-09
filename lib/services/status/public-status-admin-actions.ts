"use server";

/**
 * Server actions for the /admin/public-status surface (Slice 11).
 *
 * Two operations:
 *   - setVisible(appKey, visible) — flip whether an app appears on
 *     /status. publicStatusVisible defaults to false; admins must
 *     explicitly opt apps in.
 *   - setDisplayName(appKey, name) — override the public-facing
 *     display name. Empty / whitespace clears the override and falls
 *     back to AppRegistry.name on render.
 *
 * Both are gated by COMMAND_CENTER_MANAGE — same permission as the
 * Sync now button. Every change writes an audit log entry so we can
 * answer "who exposed app X publicly".
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export async function setPublicStatusVisible(
  appKey: string,
  visible: boolean,
): Promise<{ ok: true }> {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.COMMAND_CENTER_MANAGE,
  );

  const before = await prisma.appRegistry.findUnique({
    where: { appKey },
    select: { id: true, publicStatusVisible: true, name: true },
  });
  if (!before) throw new Error(`unknown_app: ${appKey}`);

  await prisma.appRegistry.update({
    where: { appKey },
    data: { publicStatusVisible: visible },
  });

  await writeAuditLog({
    eventType: visible
      ? "public_status.app_listed"
      : "public_status.app_unlisted",
    eventCategory: "system",
    severity: "info",
    action: `${visible ? "Listed" : "Unlisted"} ${before.name} on the public status page`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    appRegistryId: before.id,
    resourceType: "AppRegistry",
    resourceId: before.id,
    metadata: {
      appKey,
      previousVisible: before.publicStatusVisible,
      visible,
    },
  });

  revalidatePath("/admin/public-status");
  revalidatePath("/status");
  return { ok: true };
}

export async function setPublicStatusDisplayName(
  appKey: string,
  name: string,
): Promise<{ ok: true }> {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.COMMAND_CENTER_MANAGE,
  );

  const trimmed = name.trim();
  const value = trimmed.length === 0 ? null : trimmed;

  const before = await prisma.appRegistry.findUnique({
    where: { appKey },
    select: { id: true, publicStatusName: true, name: true },
  });
  if (!before) throw new Error(`unknown_app: ${appKey}`);

  await prisma.appRegistry.update({
    where: { appKey },
    data: { publicStatusName: value },
  });

  await writeAuditLog({
    eventType: "public_status.display_name_changed",
    eventCategory: "system",
    severity: "info",
    action: `Renamed ${before.name} on public status page to ${value ?? `(default: ${before.name})`}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    appRegistryId: before.id,
    resourceType: "AppRegistry",
    resourceId: before.id,
    metadata: {
      appKey,
      previousName: before.publicStatusName,
      name: value,
    },
  });

  revalidatePath("/admin/public-status");
  revalidatePath("/status");
  return { ok: true };
}
