"use server";

import { prisma } from "@/lib/db/prisma";
import {
  inviteCustomerUserSchema,
  updateOrgUserAccessSchema,
  updatePlatformUserSchema,
  removeOrgUserAccessSchema,
  type InviteCustomerUserInput,
  type UpdateOrgUserAccessInput,
  type UpdatePlatformUserInput,
  type RemoveOrgUserAccessInput,
} from "@/lib/validations/user";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS, CUSTOMER_ROLE_DEFINITIONS } from "@/lib/permissions";
import { clerkConfigured, env } from "@/lib/env";

async function ensureUserProfileByEmail(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  clerkUserId?: string;
}) {
  return prisma.userProfile.upsert({
    where: { email: input.email },
    update: {
      firstName: input.firstName || undefined,
      lastName: input.lastName || undefined,
      clerkUserId: input.clerkUserId || undefined,
    },
    create: {
      email: input.email,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      clerkUserId: input.clerkUserId ?? `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      isInternalMacTechUser: false,
      platformRole: "none",
      status: "invited",
    },
  });
}

export async function inviteCustomerUser(rawInput: InviteCustomerUserInput) {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.CUSTOMER_USERS_INVITE,
  );
  const input = inviteCustomerUserSchema.parse(rawInput);

  const org = await prisma.customerOrganization.findUnique({
    where: { id: input.customerOrganizationId },
  });
  if (!org) throw new Error("Customer organization not found.");

  const role = CUSTOMER_ROLE_DEFINITIONS.find((r) => r.key === input.role);
  if (!role) throw new Error(`Unknown customer role: ${input.role}`);

  const profile = await ensureUserProfileByEmail({
    email: input.email,
    firstName: input.firstName || undefined,
    lastName: input.lastName || undefined,
  });

  let clerkInvitationId: string | null = null;
  if (input.sendInvite && clerkConfigured() && org.clerkOrgId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const invite = await client.organizations.createOrganizationInvitation({
        organizationId: org.clerkOrgId,
        emailAddress: input.email,
        role: "org:member",
        redirectUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
        inviterUserId: ctx.clerkUserId,
      });
      clerkInvitationId = invite.id;
    } catch (err) {
      console.error("[user-service] Clerk invitation failed:", err);
    }
  }

  const access = await prisma.orgUserAccess.upsert({
    where: {
      customerOrganizationId_userProfileId: {
        customerOrganizationId: org.id,
        userProfileId: profile.id,
      },
    },
    update: {
      role: role.key,
      permissionsJson: role.permissions as unknown as object,
      status: "invited",
    },
    create: {
      customerOrganizationId: org.id,
      userProfileId: profile.id,
      role: role.key,
      permissionsJson: role.permissions as unknown as object,
      status: "invited",
    },
  });

  await writeAuditLog({
    eventType: "customer_user.invited",
    eventCategory: "user",
    severity: "info",
    action: `Invited user ${input.email} to ${org.name} as ${role.name}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: org.id,
    resourceType: "OrgUserAccess",
    resourceId: access.id,
    metadata: {
      invitedEmail: input.email,
      role: role.key,
      productAccess: input.productAccess,
      clerkInvitationId,
    },
  });

  return { access, clerkInvitationId };
}

export async function updateOrgUserAccess(rawInput: UpdateOrgUserAccessInput) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.CUSTOMER_USERS_INVITE);
  const input = updateOrgUserAccessSchema.parse(rawInput);

  const previous = await prisma.orgUserAccess.findUnique({
    where: {
      customerOrganizationId_userProfileId: {
        customerOrganizationId: input.customerOrganizationId,
        userProfileId: input.userProfileId,
      },
    },
    include: {
      userProfile: true,
      customerOrganization: true,
    },
  });
  if (!previous) throw new Error("Org user access not found.");

  const role = input.role
    ? CUSTOMER_ROLE_DEFINITIONS.find((r) => r.key === input.role)
    : null;

  const updated = await prisma.orgUserAccess.update({
    where: { id: previous.id },
    data: {
      role: role ? role.key : undefined,
      permissionsJson: role ? (role.permissions as unknown as object) : undefined,
      status: input.status ?? undefined,
    },
  });

  if (role && role.key !== previous.role) {
    await writeAuditLog({
      eventType: "customer_user.role_changed",
      eventCategory: "role",
      severity: "info",
      action: `Changed role for ${previous.userProfile.email} in ${previous.customerOrganization.name} from ${previous.role} to ${role.key}`,
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      customerOrganizationId: previous.customerOrganizationId,
      resourceType: "OrgUserAccess",
      resourceId: previous.id,
      metadata: { from: previous.role, to: role.key },
    });
  }

  if (input.status && input.status !== previous.status) {
    await writeAuditLog({
      eventType: `customer_user.${input.status}`,
      eventCategory: "user",
      severity: input.status === "suspended" ? "warning" : "info",
      action: `Set ${previous.userProfile.email} status to ${input.status} in ${previous.customerOrganization.name}`,
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      customerOrganizationId: previous.customerOrganizationId,
      resourceType: "OrgUserAccess",
      resourceId: previous.id,
      metadata: { from: previous.status, to: input.status },
    });
  }

  return updated;
}

export async function removeCustomerUser(rawInput: RemoveOrgUserAccessInput) {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.CUSTOMER_USERS_REMOVE,
  );
  const input = removeOrgUserAccessSchema.parse(rawInput);

  const access = await prisma.orgUserAccess.findUnique({
    where: {
      customerOrganizationId_userProfileId: {
        customerOrganizationId: input.customerOrganizationId,
        userProfileId: input.userProfileId,
      },
    },
    include: { userProfile: true, customerOrganization: true },
  });
  if (!access) throw new Error("Org user access not found.");

  // Best-effort: if the access has a Clerk membership and Clerk is configured,
  // also delete the membership server-side so Clerk and our DB stay aligned.
  if (access.clerkMembershipId && access.customerOrganization.clerkOrgId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      await client.organizations.deleteOrganizationMembership({
        organizationId: access.customerOrganization.clerkOrgId,
        userId: access.userProfile.clerkUserId,
      });
    } catch (err) {
      // Log but don't fail — the audit metadata captures the discrepancy.
      console.error("[user-service] Clerk membership delete failed:", err);
    }
  }

  await prisma.orgUserAccess.delete({ where: { id: access.id } });

  await writeAuditLog({
    eventType: "customer_user.removed",
    eventCategory: "user",
    severity: "warning",
    action: `Removed ${access.userProfile.email} from ${access.customerOrganization.name}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: access.customerOrganizationId,
    resourceType: "OrgUserAccess",
    resourceId: access.id,
    metadata: {
      removedEmail: access.userProfile.email,
      previousRole: access.role,
      previousStatus: access.status,
    },
  });

  return { ok: true };
}

export async function updatePlatformUser(rawInput: UpdatePlatformUserInput) {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.MACTECH_USERS_MANAGE,
  );
  const input = updatePlatformUserSchema.parse(rawInput);
  const before = await prisma.userProfile.findUnique({ where: { id: input.userProfileId } });
  if (!before) throw new Error("User not found.");

  // Self-lockout protection: a super admin cannot demote themselves to a
  // lower role or suspend their own account. They can still ask another
  // super admin to do it (or use SQL in an emergency).
  const isSelf = before.id === ctx.userProfile.id;
  if (isSelf && input.platformRole && input.platformRole !== "mactech_super_admin") {
    throw new Error(
      "You cannot demote your own platform role. Ask another super admin.",
    );
  }
  if (isSelf && input.status === "suspended") {
    throw new Error("You cannot suspend your own account.");
  }

  // If the only super admin is being demoted, refuse — preserves access.
  if (
    !isSelf &&
    before.platformRole === "mactech_super_admin" &&
    input.platformRole &&
    input.platformRole !== "mactech_super_admin"
  ) {
    const otherSuperAdmins = await prisma.userProfile.count({
      where: {
        platformRole: "mactech_super_admin",
        status: "active",
        id: { not: before.id },
      },
    });
    if (otherSuperAdmins === 0) {
      throw new Error(
        "Cannot demote the last super admin. Promote another user first.",
      );
    }
  }

  const after = await prisma.userProfile.update({
    where: { id: input.userProfileId },
    data: {
      platformRole: input.platformRole ?? undefined,
      status: input.status ?? undefined,
      isInternalMacTechUser:
        input.platformRole === "none"
          ? false
          : input.platformRole
            ? true
            : undefined,
    },
  });

  if (input.platformRole && input.platformRole !== before.platformRole) {
    await writeAuditLog({
      eventType: "platform_user.role_changed",
      eventCategory: "role",
      severity: "info",
      action: `Changed platform role for ${after.email} from ${before.platformRole} to ${input.platformRole}`,
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      resourceType: "UserProfile",
      resourceId: after.id,
      metadata: { from: before.platformRole, to: input.platformRole },
    });
  }

  if (input.status && input.status !== before.status) {
    await writeAuditLog({
      eventType: `platform_user.${input.status}`,
      eventCategory: "user",
      severity: input.status === "suspended" ? "warning" : "info",
      action: `Set MacTech user ${after.email} status to ${input.status}`,
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      resourceType: "UserProfile",
      resourceId: after.id,
      metadata: { from: before.status, to: input.status },
    });
  }

  return after;
}
