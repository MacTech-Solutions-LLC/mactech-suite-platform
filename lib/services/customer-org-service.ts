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
import {
  buildPublicMetadata,
  createClerkOrg,
  fetchClerkOrg,
  tryClerk,
  updateClerkOrg,
  ClerkSyncError,
} from "./clerk-org-service";

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

export interface CreateCustomerOrgResult {
  org: Awaited<ReturnType<typeof prisma.customerOrganization.create>>;
  clerkSync: { ok: boolean; error?: string };
}

/**
 * Create a customer organization end-to-end:
 *   1. Create the Clerk org (when configured) — name, slug, createdBy,
 *      publicMetadata mirroring our business fields, optional max members.
 *   2. Create the local CustomerOrganization row (always, even if Clerk
 *      fails — the admin can re-link later via syncFromClerk).
 *   3. Create initial product entitlements (trial plan).
 *   4. Refresh Clerk publicMetadata so it reflects the entitlements that
 *      were just enabled.
 *   5. Audit the create + every entitlement enable.
 *
 * Surfaces a `clerkSync.error` field when Clerk is unreachable so the UI
 * can show a clear "Local row created but Clerk sync failed" message
 * instead of failing the whole operation.
 */
export async function createCustomerOrganization(
  rawInput: CreateCustomerOrgInput,
): Promise<CreateCustomerOrgResult> {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.CUSTOMER_ORGS_CREATE);
  const input = createCustomerOrgSchema.parse(rawInput);
  const slug = await ensureUniqueSlug(deriveSlug(input.name));

  // Build the publicMetadata payload up front. We don't have entitlements
  // yet, so enabledApps starts empty and we re-push after the entitlement
  // upserts below.
  const publicMetadataInitial = buildPublicMetadata(
    {
      id: "pending",
      slug,
      customerType: input.customerType,
      subscriptionTier: input.subscriptionTier,
      cmmcTargetLevel: input.cmmcTargetLevel,
      cuiBoundaryType: input.cuiBoundaryType,
      status: "onboarding",
      industry: input.industry || null,
    } as never,
    [],
  );

  let clerkOrgId: string | null = null;
  let clerkSync: CreateCustomerOrgResult["clerkSync"] = { ok: true };
  const clerkResult = await tryClerk("createOrganization", () =>
    createClerkOrg({
      name: input.name,
      slug,
      createdBy: ctx.clerkUserId,
      publicMetadata: publicMetadataInitial,
      maxAllowedMemberships: input.maxMembers ?? null,
    }),
  );
  if (clerkResult.ok) {
    clerkOrgId = clerkResult.value.id;
  } else {
    clerkSync = { ok: false, error: clerkResult.error };
  }

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
      maxMembers: input.maxMembers ?? null,
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

    // Push the now-enabled apps into Clerk publicMetadata so sibling apps
    // can read it from Clerk directly. Best-effort.
    if (clerkOrgId) {
      const enabled = await prisma.productEntitlement.findMany({
        where: { customerOrganizationId: org.id, enabled: true },
        include: { app: { select: { appKey: true } } },
      });
      await tryClerk("updateOrganization (post-create entitlements)", () =>
        updateClerkOrg({
          clerkOrgId,
          publicMetadata: buildPublicMetadata(org, enabled),
        }),
      );
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
      clerkOrgId,
      clerkSyncOk: clerkSync.ok,
      clerkSyncError: clerkSync.error,
      subscriptionTier: org.subscriptionTier,
      maxMembers: org.maxMembers,
    },
  });

  return { org, clerkSync };
}

export async function updateCustomerOrganization(
  orgId: string,
  rawInput: UpdateCustomerOrgInput,
): Promise<{ org: Awaited<ReturnType<typeof prisma.customerOrganization.update>>; clerkSync: { ok: boolean; error?: string } }> {
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
      maxMembers: input.maxMembers ?? undefined,
    },
  });

  // Mirror to Clerk: name change, slug change (rare), and refreshed
  // publicMetadata so sibling apps see the latest business state.
  let clerkSync: { ok: boolean; error?: string } = { ok: true };
  if (after.clerkOrgId) {
    const enabled = await prisma.productEntitlement.findMany({
      where: { customerOrganizationId: after.id, enabled: true },
      include: { app: { select: { appKey: true } } },
    });
    const result = await tryClerk("updateOrganization", () =>
      updateClerkOrg({
        clerkOrgId: after.clerkOrgId!,
        name: input.name ?? undefined,
        publicMetadata: buildPublicMetadata(after, enabled),
        maxAllowedMemberships: after.maxMembers ?? null,
      }),
    );
    if (!result.ok) clerkSync = { ok: false, error: result.error };
  }

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
      clerkSyncOk: clerkSync.ok,
      clerkSyncError: clerkSync.error,
    },
  });

  return { org: after, clerkSync };
}

export async function suspendCustomerOrganization(orgId: string, reason: string) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.CUSTOMER_ORGS_DISABLE);
  const org = await prisma.customerOrganization.update({
    where: { id: orgId },
    data: { status: "suspended" },
  });

  // Push suspension state into Clerk publicMetadata so sibling apps can
  // refuse access on read. Best-effort — local suspension still applies
  // even if Clerk is unreachable.
  if (org.clerkOrgId) {
    const enabled = await prisma.productEntitlement.findMany({
      where: { customerOrganizationId: org.id, enabled: true },
      include: { app: { select: { appKey: true } } },
    });
    await tryClerk("updateOrganization (suspend)", () =>
      updateClerkOrg({
        clerkOrgId: org.clerkOrgId!,
        publicMetadata: buildPublicMetadata(org, enabled),
      }),
    );
  }

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

/**
 * Pull the latest Clerk-side state for an org and update the local row.
 * Surfaced as a "Resync from Clerk" button in the org detail header.
 */
export async function syncOrgFromClerk(orgId: string) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.CUSTOMER_ORGS_UPDATE);
  const org = await prisma.customerOrganization.findUnique({ where: { id: orgId } });
  if (!org) throw new Error("Customer organization not found.");
  if (!org.clerkOrgId) {
    throw new ClerkSyncError("This organization is not linked to a Clerk org yet.");
  }
  const clerkOrg = await fetchClerkOrg(org.clerkOrgId);
  if (!clerkOrg) {
    throw new ClerkSyncError(
      "The linked Clerk org no longer exists. Unlink + recreate via the Clerk dashboard.",
    );
  }
  const updated = await prisma.customerOrganization.update({
    where: { id: org.id },
    data: {
      name: clerkOrg.name,
      slug: clerkOrg.slug || org.slug,
      imageUrl: clerkOrg.imageUrl,
    },
  });
  await writeAuditLog({
    eventType: "customer_org.synced_from_clerk",
    eventCategory: "org",
    severity: "info",
    action: `Resynced ${updated.name} from Clerk`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: updated.id,
    resourceType: "CustomerOrganization",
    resourceId: updated.id,
    metadata: { membersCount: clerkOrg.membersCount },
  });
  return { org: updated, clerk: clerkOrg };
}
