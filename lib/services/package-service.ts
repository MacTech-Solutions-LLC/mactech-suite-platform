"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import {
  upsertPackageSchema,
  PackageStatusEnum,
  type UpsertPackageInput,
} from "@/lib/validations/package";
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

  revalidatePath("/admin/packages");

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

/**
 * Flip a package's lifecycle status from an inline control on
 * /admin/packages. The marketing catalog (GET /api/public/packages)
 * only returns `status="active"` rows, so:
 *   - active   → live and checkout-eligible
 *   - draft    → hidden from buyers (work-in-progress)
 *   - archived → hidden from buyers (retired)
 * Note: this updates the catalog the marketing site *reads*, but the
 * marketing site is a separate deployment that caches the response —
 * a package change here won't surface there until that site re-fetches.
 */
export async function setPackageStatus(id: string, statusInput: string) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.PACKAGES_MANAGE);
  const status = PackageStatusEnum.parse(statusInput);

  const previous = await prisma.package.findUnique({ where: { id } });
  if (!previous) {
    return { ok: false as const, error: "Package not found" };
  }
  if (previous.status === status) {
    return { ok: true as const, status };
  }

  const pkg = await prisma.package.update({ where: { id }, data: { status } });

  revalidatePath("/admin/packages");

  await writeAuditLog({
    eventType:
      status === "archived"
        ? "package.archived"
        : status === "active"
          ? "package.activated"
          : "package.drafted",
    eventCategory: "system",
    severity: "info",
    action: `Set package ${pkg.name} (${pkg.sku}) to ${status}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "Package",
    resourceId: pkg.id,
    metadata: { status, previousStatus: previous.status },
  });

  return { ok: true as const, status };
}
