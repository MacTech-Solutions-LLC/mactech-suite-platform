"use server";

import { prisma } from "@/lib/db/prisma";
import {
  inviteCustomerUserSchema,
  updateOrgUserAccessSchema,
  updatePlatformUserSchema,
  removeOrgUserAccessSchema,
  addUserToOrgSchema,
  type InviteCustomerUserInput,
  type UpdateOrgUserAccessInput,
  type UpdatePlatformUserInput,
  type RemoveOrgUserAccessInput,
  type AddUserToOrgInput,
} from "@/lib/validations/user";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS, CUSTOMER_ROLE_DEFINITIONS } from "@/lib/permissions";
import { clerkConfigured, env } from "@/lib/env";
import { localRoleToClerkRole } from "@/lib/clerk-role-map";
import {
  createClerkInvitation,
  createClerkMembership,
  deleteClerkMembership,
  tryClerk,
  updateClerkMembershipRole,
} from "./clerk-org-service";
import { dispatchWebhookEvent } from "./webhook-service";

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
    const result = await tryClerk("createOrganizationInvitation", () =>
      createClerkInvitation({
        clerkOrgId: org.clerkOrgId!,
        emailAddress: input.email,
        inviterUserId: ctx.clerkUserId,
        role: localRoleToClerkRole(role.key),
        redirectUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
      }),
    );
    if (result.ok) clerkInvitationId = result.value.id;
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

  const auditEntry = await writeAuditLog({
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

  void dispatchWebhookEvent({
    eventType: "customer_user.invited",
    eventId: auditEntry.id,
    customerOrganizationId: org.id,
    payload: {
      orgId: org.id,
      clerkOrgId: org.clerkOrgId,
      email: input.email,
      role: role.key,
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
    // Mirror the role change to Clerk's membership when both sides are linked
    // and the change crosses the admin/member boundary. Best-effort.
    const newClerkRole = localRoleToClerkRole(role.key);
    const oldClerkRole = localRoleToClerkRole(previous.role);
    if (
      newClerkRole !== oldClerkRole &&
      previous.customerOrganization.clerkOrgId &&
      previous.userProfile.clerkUserId &&
      !previous.userProfile.clerkUserId.startsWith("pending_")
    ) {
      await tryClerk("updateOrganizationMembership (role)", () =>
        updateClerkMembershipRole({
          clerkOrgId: previous.customerOrganization.clerkOrgId!,
          clerkUserId: previous.userProfile.clerkUserId,
          role: newClerkRole,
        }),
      );
    }
    const auditEntry = await writeAuditLog({
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
      metadata: {
        from: previous.role,
        to: role.key,
        clerkRoleFrom: oldClerkRole,
        clerkRoleTo: newClerkRole,
      },
    });
    void dispatchWebhookEvent({
      eventType: "customer_user.role_changed",
      eventId: auditEntry.id,
      customerOrganizationId: previous.customerOrganizationId,
      payload: {
        orgId: previous.customerOrganizationId,
        clerkOrgId: previous.customerOrganization.clerkOrgId,
        email: previous.userProfile.email,
        clerkUserId: previous.userProfile.clerkUserId,
        from: previous.role,
        to: role.key,
      },
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

/**
 * Add an *existing* UserProfile to a customer org. Distinct from
 * `inviteCustomerUser` which targets unknown emails (and may issue a Clerk
 * invitation). This one assumes the profile is already provisioned and the
 * user can sign in — we just attach an OrgUserAccess (and a Clerk
 * organization membership when both sides are configured).
 */
export async function addUserToOrg(rawInput: AddUserToOrgInput) {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.CUSTOMER_USERS_INVITE,
  );
  const input = addUserToOrgSchema.parse(rawInput);

  const role = CUSTOMER_ROLE_DEFINITIONS.find((r) => r.key === input.role);
  if (!role) throw new Error(`Unknown customer role: ${input.role}`);

  const [profile, org] = await Promise.all([
    prisma.userProfile.findUnique({ where: { id: input.userProfileId } }),
    prisma.customerOrganization.findUnique({
      where: { id: input.customerOrganizationId },
    }),
  ]);
  if (!profile || !org) throw new Error("User or organization not found.");

  let clerkMembershipId: string | null = null;
  const hasRealClerkUser =
    Boolean(profile.clerkUserId) && !profile.clerkUserId.startsWith("pending_");
  if (clerkConfigured() && org.clerkOrgId && hasRealClerkUser) {
    const result = await tryClerk("createOrganizationMembership", () =>
      createClerkMembership({
        clerkOrgId: org.clerkOrgId!,
        clerkUserId: profile.clerkUserId,
        role: localRoleToClerkRole(role.key),
      }),
    );
    if (result.ok) clerkMembershipId = result.value.id;
    // Membership may already exist in Clerk; the local upsert still captures
    // it via clerkMembershipId being null. Audit metadata reflects Clerk state.
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
      status: "active",
      clerkMembershipId: clerkMembershipId ?? undefined,
    },
    create: {
      customerOrganizationId: org.id,
      userProfileId: profile.id,
      role: role.key,
      permissionsJson: role.permissions as unknown as object,
      status: "active",
      clerkMembershipId,
    },
  });

  const auditEntry = await writeAuditLog({
    eventType: "customer_user.added",
    eventCategory: "user",
    severity: "info",
    action: `Added ${profile.email} to ${org.name} as ${role.name}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: org.id,
    resourceType: "OrgUserAccess",
    resourceId: access.id,
    metadata: {
      role: role.key,
      viaClerk: Boolean(clerkMembershipId),
    },
  });

  void dispatchWebhookEvent({
    eventType: "customer_user.added",
    eventId: auditEntry.id,
    customerOrganizationId: org.id,
    payload: {
      orgId: org.id,
      clerkOrgId: org.clerkOrgId,
      email: profile.email,
      clerkUserId: profile.clerkUserId,
      role: role.key,
    },
  });

  return access;
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
  if (
    access.customerOrganization.clerkOrgId &&
    access.userProfile.clerkUserId &&
    !access.userProfile.clerkUserId.startsWith("pending_")
  ) {
    await tryClerk("deleteOrganizationMembership", () =>
      deleteClerkMembership({
        clerkOrgId: access.customerOrganization.clerkOrgId!,
        clerkUserId: access.userProfile.clerkUserId,
      }),
    );
  }

  await prisma.orgUserAccess.delete({ where: { id: access.id } });

  const auditEntry = await writeAuditLog({
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

  void dispatchWebhookEvent({
    eventType: "customer_user.removed",
    eventId: auditEntry.id,
    customerOrganizationId: access.customerOrganizationId,
    payload: {
      orgId: access.customerOrganizationId,
      clerkOrgId: access.customerOrganization.clerkOrgId,
      email: access.userProfile.email,
      clerkUserId: access.userProfile.clerkUserId,
      previousRole: access.role,
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
