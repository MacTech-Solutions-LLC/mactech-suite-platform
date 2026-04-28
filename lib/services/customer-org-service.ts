"use server";

import { prisma } from "@/lib/db/prisma";
import {
  createCustomerOrgSchema,
  updateCustomerOrgSchema,
  type CreateCustomerOrgInput,
  type UpdateCustomerOrgInput,
  slugRegex,
} from "@/lib/validations/customer-org";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { clerkConfigured } from "@/lib/env";

function deriveSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "org";
}

async function ensureUniqueSlug(base: string, idToIgnore?: string): Promise<string> {
  let candidate = base;
  if (!slugRegex.test(candidate)) candidate = "org";
  for (let i = 0; i < 50; i++) {
    const existing = await prisma.customerOrganization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === idToIgnore) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

async function createClerkOrgIfPossible(
  name: string,
  slug: string,
  createdBy: string,
): Promise<string | null> {
  if (!clerkConfigured()) return null;
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const org = await client.organizations.createOrganization({
      name,
      slug,
      createdBy,
    });
    return org.id;
  } catch (err) {
    // Surfaced via audit metadata; we still create the local record so admins
    // can complete the Clerk linkage manually later.
    console.error("[customer-org-service] Clerk org create failed:", err);
    return null;
  }
}

export async function createCustomerOrganization(rawInput: CreateCustomerOrgInput) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.CUSTOMER_ORGS_CREATE);
  const input = createCustomerOrgSchema.parse(rawInput);

  const slug = await ensureUniqueSlug(deriveSlug(input.name));
  const clerkOrgId = await createClerkOrgIfPossible(input.name, slug, ctx.clerkUserId);

  const org = await prisma.customerOrganization.create({
    data: {
      name: input.name,
      slug,
      legalName: input.legalName || null,
      domain: input.domain || null,
      cageCode: input.cageCode || null,
      uei: input.uei || null,
      duns: input.duns || null,
      industry: input.industry || null,
      customerType: input.customerType,
      subscriptionTier: input.subscriptionTier,
      cmmcTargetLevel: input.cmmcTargetLevel,
      cuiBoundaryType: input.cuiBoundaryType,
      primaryContactName: input.primaryContactName || null,
      primaryContactEmail: input.primaryContactEmail || null,
      notes: input.notes || null,
      clerkOrgId,
      status: "onboarding",
    },
  });

  if (input.initialAppKeys.length > 0) {
    const apps = await prisma.appRegistry.findMany({
      where: { appKey: { in: input.initialAppKeys } },
      select: { id: true, appKey: true, name: true },
    });
    for (const app of apps) {
      await prisma.productEntitlement.create({
        data: {
          customerOrganizationId: org.id,
          appRegistryId: app.id,
          enabled: true,
          plan: "trial",
          status: "trialing",
        },
      });
      await writeAuditLog({
        eventType: "entitlement.enabled",
        eventCategory: "entitlement",
        severity: "info",
        action: `Enabled ${app.name} (trial) for ${org.name}`,
        actorClerkUserId: ctx.clerkUserId,
        actorEmail: ctx.userProfile.email,
        actorUserProfileId: ctx.userProfile.id,
        customerOrganizationId: org.id,
        appRegistryId: app.id,
        resourceType: "ProductEntitlement",
        metadata: { appKey: app.appKey, plan: "trial" },
      });
    }
  }

  await writeAuditLog({
    eventType: "customer_org.created",
    eventCategory: "org",
    severity: "info",
    action: `Created customer organization ${org.name}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: org.id,
    resourceType: "CustomerOrganization",
    resourceId: org.id,
    metadata: {
      slug: org.slug,
      clerkOrgCreated: Boolean(clerkOrgId),
      subscriptionTier: org.subscriptionTier,
    },
  });

  return org;
}

export async function updateCustomerOrganization(
  orgId: string,
  rawInput: UpdateCustomerOrgInput,
) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.CUSTOMER_ORGS_UPDATE);
  const input = updateCustomerOrgSchema.parse(rawInput);
  const before = await prisma.customerOrganization.findUnique({ where: { id: orgId } });
  if (!before) throw new Error("Customer organization not found.");

  const after = await prisma.customerOrganization.update({
    where: { id: orgId },
    data: {
      name: input.name ?? undefined,
      legalName: input.legalName === "" ? null : input.legalName ?? undefined,
      domain: input.domain === "" ? null : input.domain ?? undefined,
      cageCode: input.cageCode === "" ? null : input.cageCode ?? undefined,
      uei: input.uei === "" ? null : input.uei ?? undefined,
      duns: input.duns === "" ? null : input.duns ?? undefined,
      industry: input.industry === "" ? null : input.industry ?? undefined,
      customerType: input.customerType ?? undefined,
      subscriptionTier: input.subscriptionTier ?? undefined,
      cmmcTargetLevel: input.cmmcTargetLevel ?? undefined,
      cuiBoundaryType: input.cuiBoundaryType ?? undefined,
      primaryContactName:
        input.primaryContactName === "" ? null : input.primaryContactName ?? undefined,
      primaryContactEmail:
        input.primaryContactEmail === "" ? null : input.primaryContactEmail ?? undefined,
      notes: input.notes === "" ? null : input.notes ?? undefined,
      status: input.status ?? undefined,
    },
  });

  await writeAuditLog({
    eventType: "customer_org.updated",
    eventCategory: "org",
    severity: "info",
    action: `Updated customer organization ${after.name}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: after.id,
    resourceType: "CustomerOrganization",
    resourceId: after.id,
    metadata: {
      changedFields: Object.keys(input),
      previousStatus: before.status,
      newStatus: after.status,
    },
  });

  return after;
}

export async function suspendCustomerOrganization(orgId: string, reason: string) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.CUSTOMER_ORGS_DISABLE);
  const org = await prisma.customerOrganization.update({
    where: { id: orgId },
    data: { status: "suspended" },
  });
  await writeAuditLog({
    eventType: "customer_org.suspended",
    eventCategory: "org",
    severity: "warning",
    action: `Suspended customer organization ${org.name}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: org.id,
    resourceType: "CustomerOrganization",
    resourceId: org.id,
    metadata: { reason },
  });
  return org;
}
