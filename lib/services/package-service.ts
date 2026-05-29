"use server";

import { prisma } from "@/lib/db/prisma";
import { upsertPackageSchema, type UpsertPackageInput } from "@/lib/validations/package";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";

export async function upsertPackage(rawInput: UpsertPackageInput) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.PACKAGES_MANAGE);
  const input = upsertPackageSchema.parse(rawInput);

  const priceCents = Math.round(input.priceMajor * 100);
  const previous = input.id
    ? await prisma.package.findUnique({ where: { id: input.id } })
    : await prisma.package.findUnique({ where: { sku: input.sku } });

  const data = {
    sku: input.sku,
    name: input.name,
    description: input.description || null,
    priceCents,
    currency: input.currency,
    billingCycle: input.billingCycle,
    entitlementTier: input.entitlementTier,
    includedAppKeys: input.includedAppKeys,
    status: input.status,
  };

  const pkg = previous
    ? await prisma.package.update({ where: { id: previous.id }, data })
    : await prisma.package.create({ data });

  await writeAuditLog({
    eventType: previous ? "package.updated" : "package.created",
    eventCategory: "system",
    severity: "info",
    action: `${previous ? "Updated" : "Created"} package ${pkg.name} (${pkg.sku})`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "Package",
    resourceId: pkg.id,
    metadata: {
      sku: pkg.sku,
      priceCents: pkg.priceCents,
      billingCycle: pkg.billingCycle,
      status: pkg.status,
      previousStatus: previous?.status,
    },
  });

  return pkg;
}

export async function archivePackage(id: string) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.PACKAGES_MANAGE);
  const pkg = await prisma.package.update({
    where: { id },
    data: { status: "archived" },
  });
  await writeAuditLog({
    eventType: "package.archived",
    eventCategory: "system",
    severity: "info",
    action: `Archived package ${pkg.name} (${pkg.sku})`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "Package",
    resourceId: pkg.id,
  });
  return pkg;
}
