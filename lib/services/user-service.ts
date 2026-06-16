"use server";

import { prisma } from "@/lib/db/prisma";
import {
  inviteCustomerUserSchema,
  updateOrgUserAccessSchema,
  updatePlatformUserSchema,
  removeOrgUserAccessSchema,
  addUserToOrgSchema,
  resendCustomerInvitationSchema,
  type InviteCustomerUserInput,
  type UpdateOrgUserAccessInput,
  type UpdatePlatformUserInput,
  type RemoveOrgUserAccessInput,
  type AddUserToOrgInput,
  type ResendCustomerInvitationInput,
} from "@/lib/validations/user";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS, CUSTOMER_ROLE_DEFINITIONS } from "@/lib/permissions";
import { clerkConfigured, env } from "@/lib/env";
import { localRoleToClerkRole } from "@/lib/clerk-role-map";
import {
  createClerkInvitation,
  createClerkMembership,
  createClerkSignInToken,
  deleteClerkMembership,
  listPendingOrgInvitations,
  revokeOrgInvitation,
  tryClerk,
  updateClerkMembershipRole,
} from "./clerk-org-service";
import { dispatchWebhookEvent } from "./webhook-service";
import { sendTeamEmail } from "@/lib/integrations/email/client";
import {
  renderEmailHtml,
  renderEmailText,
  type EmailTemplate,
} from "@/lib/integrations/email/template";

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
  if (input.sendInvite) {
    if (!clerkConfigured()) {
      throw new Error(
        "Clerk is not configured on this environment — cannot send an invitation email. Disable 'Send invite' or configure Clerk first.",
      );
    }
    if (!org.clerkOrgId) {
      throw new Error(
        `Organization '${org.name}' is not linked to Clerk yet. Provision the Clerk organization first, then try again.`,
      );
    }
    const result = await tryClerk("createOrganizationInvitation", () =>
      createClerkInvitation({
        clerkOrgId: org.clerkOrgId!,
        emailAddress: input.email,
        inviterUserId: ctx.clerkUserId,
        role: localRoleToClerkRole(role.key),
        // Land them on /sign-up so Clerk's hosted <SignUp /> component
        // can consume the `__clerk_ticket` query param, create the
        // user, accept the org membership, then forward to /welcome
        // (configured via SignUp afterSignUpUrl).
        redirectUrl: `${env.NEXT_PUBLIC_APP_URL}/sign-up`,
      }),
    );
    if (!result.ok) {
      // Surface the failure instead of silently creating a local row
      // that the user has no way to act on.
      throw new Error(`Failed to send Clerk invitation: ${result.error}`);
    }
    clerkInvitationId = result.value.id;
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

  if (auditEntry) {

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

  }

  return { access, clerkInvitationId };
}

/**
 * Re-send a customer user's path-to-login. Branches on the user's
 * actual Clerk state:
 *
 *   - No Clerk account yet (UserProfile.clerkUserId is empty or a
 *     `pending_*` placeholder) → revoke any existing pending Clerk
 *     org invitation for this email, then issue a fresh one (which
 *     triggers Clerk to send a new invitation email). Local status
 *     is reset to "invited" so the admin UI tells the truth.
 *
 *   - Real Clerk account → mint a one-time sign-in URL and email it
 *     via the Suite's Resend mailer. The user signs in via that
 *     link, then can change their password from their Clerk profile.
 *
 * Either branch ends with the user having a working, unexpired link
 * in their inbox. This is the only admin-driven path to recover from
 * lost / failed invitation emails — admins never see or set a
 * password themselves (Clerk forbids that for good reason).
 */
export async function resendCustomerUserInvitation(
  rawInput: ResendCustomerInvitationInput,
) {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.CUSTOMER_USERS_INVITE,
  );
  const input = resendCustomerInvitationSchema.parse(rawInput);

  const access = await prisma.orgUserAccess.findUnique({
    where: {
      customerOrganizationId_userProfileId: {
        customerOrganizationId: input.customerOrganizationId,
        userProfileId: input.userProfileId,
      },
    },
    include: { userProfile: true, customerOrganization: true },
  });
  if (!access) {
    throw new Error("User is not a member of this organization.");
  }
  const { userProfile: profile, customerOrganization: org } = access;

  if (!clerkConfigured()) {
    throw new Error(
      "Clerk is not configured on this environment — cannot send a sign-in link.",
    );
  }
  if (!org.clerkOrgId) {
    throw new Error(
      `Organization '${org.name}' is not linked to Clerk yet. Provision the Clerk organization first, then try again.`,
    );
  }

  const hasRealClerkUser =
    Boolean(profile.clerkUserId) && !profile.clerkUserId.startsWith("pending_");

  if (hasRealClerkUser) {
    const token = await createClerkSignInToken({
      clerkUserId: profile.clerkUserId,
      expiresInSeconds: 60 * 60 * 24,
    });

    const tpl: EmailTemplate = {
      heroEyebrow: `MacTech Suite · ${org.name}`,
      heroTitle: "Your sign-in link is ready",
      heroSubtitle: `An admin generated a one-time sign-in link for ${profile.email}.`,
      sections: [
        {
          heading: "How to sign in",
          body: "Click the button below within the next 24 hours. After you're signed in you can set or change your password from your profile.",
        },
      ],
      cta: { label: "Sign in to MacTech Suite", href: token.url },
      dangerCard:
        "If you did not request this link, you can ignore this email — the link expires on its own. Never share it.",
    };
    const send = await sendTeamEmail({
      to: [profile.email],
      subject: `Sign in to MacTech Suite — ${org.name}`,
      text: renderEmailText(tpl),
      html: renderEmailHtml(tpl),
    });
    // `not_configured` is a deliberate dev-mode no-op in the mailer;
    // any other failure means the user won't get a link, so surface it.
    if (!send.ok && send.skippedReason !== "not_configured") {
      throw new Error(
        `Failed to send sign-in email: ${send.error ?? "unknown"}`,
      );
    }

    const auditEntry = await writeAuditLog({
      eventType: "customer_user.signin_link_sent",
      eventCategory: "user",
      severity: "info",
      action: `Sent sign-in link to ${profile.email} (${org.name})`,
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      customerOrganizationId: org.id,
      resourceType: "OrgUserAccess",
      resourceId: access.id,
      metadata: {
        tokenId: token.id,
        emailSkipped: send.skippedReason === "not_configured",
      },
    });

    if (auditEntry) {

      void dispatchWebhookEvent({
        eventType: "customer_user.signin_link_sent",
        eventId: auditEntry.id,
        customerOrganizationId: org.id,
        payload: {
          orgId: org.id,
          clerkOrgId: org.clerkOrgId,
          email: profile.email,
          clerkUserId: profile.clerkUserId,
        },
      });

    }

    return {
      mode: "signin_token" as const,
      email: profile.email,
      emailSkipped: send.skippedReason === "not_configured",
    };
  }

  // Pending Clerk user path: revoke duplicates, re-issue the invitation.
  const pending = await listPendingOrgInvitations({
    clerkOrgId: org.clerkOrgId,
    emailAddress: profile.email,
  });
  for (const inv of pending) {
    await revokeOrgInvitation({
      clerkOrgId: org.clerkOrgId,
      invitationId: inv.id,
      requestingUserId: ctx.clerkUserId,
    });
  }

  const role = CUSTOMER_ROLE_DEFINITIONS.find((r) => r.key === access.role);
  if (!role) {
    throw new Error(`Unknown customer role on access row: ${access.role}`);
  }

  const fresh = await createClerkInvitation({
    clerkOrgId: org.clerkOrgId,
    emailAddress: profile.email,
    inviterUserId: ctx.clerkUserId,
    role: localRoleToClerkRole(role.key),
    redirectUrl: `${env.NEXT_PUBLIC_APP_URL}/sign-up`,
  });

  await prisma.orgUserAccess.update({
    where: { id: access.id },
    data: { status: "invited" },
  });

  const auditEntry = await writeAuditLog({
    eventType: "customer_user.invitation_resent",
    eventCategory: "user",
    severity: "info",
    action: `Re-sent Clerk invitation to ${profile.email} (${org.name}) as ${role.name}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    customerOrganizationId: org.id,
    resourceType: "OrgUserAccess",
    resourceId: access.id,
    metadata: {
      role: role.key,
      revokedCount: pending.length,
      clerkInvitationId: fresh.id,
    },
  });

  if (auditEntry) {

    void dispatchWebhookEvent({
      eventType: "customer_user.invitation_resent",
      eventId: auditEntry.id,
      customerOrganizationId: org.id,
      payload: {
        orgId: org.id,
        clerkOrgId: org.clerkOrgId,
        email: profile.email,
        role: role.key,
        clerkInvitationId: fresh.id,
        revokedCount: pending.length,
      },
    });

  }

  return {
    mode: "invitation" as const,
    email: profile.email,
    clerkInvitationId: fresh.id,
    revokedCount: pending.length,
  };
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
    if (auditEntry) {
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

  // Preconditions: this entry point is for users who already have a real
  // Clerk account. Without one, marking them "active" locally creates the
  // exact drift we've been fixing (row says active, Clerk has no member).
  const hasRealClerkUser =
    Boolean(profile.clerkUserId) && !profile.clerkUserId.startsWith("pending_");
  if (!hasRealClerkUser) {
    throw new Error(
      `${profile.email} has not completed Clerk sign-up yet. Use "Send sign-in link" / "Resend invitation" instead so they can set a password first.`,
    );
  }
  if (!clerkConfigured()) {
    throw new Error(
      "Clerk is not configured on this environment — cannot add a member.",
    );
  }
  if (!org.clerkOrgId) {
    throw new Error(
      `Organization '${org.name}' is not linked to Clerk yet. Provision the Clerk organization first, then try again.`,
    );
  }

  const membershipResult = await tryClerk("createOrganizationMembership", () =>
    createClerkMembership({
      clerkOrgId: org.clerkOrgId!,
      clerkUserId: profile.clerkUserId,
      role: localRoleToClerkRole(role.key),
    }),
  );
  if (!membershipResult.ok) {
    throw new Error(
      `Failed to add ${profile.email} to Clerk organization: ${membershipResult.error}`,
    );
  }
  const clerkMembershipId = membershipResult.value.id;

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
      clerkMembershipId,
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
      clerkMembershipId,
    },
  });

  if (auditEntry) {

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

  }

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

  if (auditEntry) {

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

  }

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
