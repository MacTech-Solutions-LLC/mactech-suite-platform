/**
 * Server-side helpers for syncing Clerk webhook payloads into local data.
 *
 * Each function is idempotent — they upsert by Clerk identifiers so retries
 * (which webhooks frequently produce) do not create duplicate rows.
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";

interface ClerkUserPayload {
  id: string;
  email_addresses?: Array<{ email_address: string; id: string }>;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

function pickPrimaryEmail(user: ClerkUserPayload): string | null {
  if (!user.email_addresses || user.email_addresses.length === 0) return null;
  if (user.primary_email_address_id) {
    const found = user.email_addresses.find((e) => e.id === user.primary_email_address_id);
    if (found) return found.email_address;
  }
  return user.email_addresses[0]?.email_address ?? null;
}

/**
 * Find — and if necessary, create or claim — a local UserProfile for a
 * Clerk user id. Tries `clerkUserId` first, then falls back to fetching
 * the user from Clerk's API and looking up by email (the path that
 * matters when an `organizationMembership.created` webhook beats its
 * sibling `user.created` to the door and we still hold a `pending_*`
 * placeholder profile from an outstanding invitation).
 *
 * Returns null only when Clerk has no email on file or the lookup
 * itself fails; callers should treat that as "skip and log."
 */
async function resolveOrAdoptUserProfile(clerkUserId: string) {
  const byId = await prisma.userProfile.findUnique({ where: { clerkUserId } });
  if (byId) return byId;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const cu = await client.users.getUser(clerkUserId);
    const primary =
      cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId) ??
      cu.emailAddresses[0];
    const email = primary?.emailAddress;
    if (!email) return null;

    const existing = await prisma.userProfile.findUnique({ where: { email } });
    if (existing) {
      return prisma.userProfile.update({
        where: { id: existing.id },
        data: {
          clerkUserId,
          firstName: existing.firstName ?? cu.firstName ?? null,
          lastName: existing.lastName ?? cu.lastName ?? null,
          imageUrl: existing.imageUrl ?? cu.imageUrl ?? null,
          status: existing.status === "invited" ? "active" : existing.status,
        },
      });
    }
    return prisma.userProfile.create({
      data: {
        clerkUserId,
        email,
        firstName: cu.firstName ?? null,
        lastName: cu.lastName ?? null,
        imageUrl: cu.imageUrl ?? null,
        isInternalMacTechUser: false,
        platformRole: "none",
        status: "active",
      },
    });
  } catch (err) {
    console.error(
      `[clerk-sync] resolveOrAdoptUserProfile failed for ${clerkUserId}:`,
      err,
    );
    return null;
  }
}

export async function upsertUserFromClerk(user: ClerkUserPayload) {
  const email = pickPrimaryEmail(user);
  if (!email) {
    console.warn(`[clerk-sync] Skipping user ${user.id}: no email`);
    return null;
  }

  const existing = await prisma.userProfile.findFirst({
    where: { OR: [{ clerkUserId: user.id }, { email }] },
  });

  const data = {
    clerkUserId: user.id,
    email,
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    imageUrl: user.image_url ?? null,
  };

  if (existing) {
    return prisma.userProfile.update({
      where: { id: existing.id },
      data: { ...data, status: existing.status === "invited" ? "active" : existing.status },
    });
  }

  return prisma.userProfile.create({
    data: {
      ...data,
      isInternalMacTechUser: false,
      platformRole: "none",
      status: "active",
    },
  });
}

export async function deleteUserFromClerk(clerkUserId: string) {
  const existing = await prisma.userProfile.findUnique({ where: { clerkUserId } });
  if (!existing) return null;
  return prisma.userProfile.update({
    where: { id: existing.id },
    data: { status: "suspended" },
  });
}

interface ClerkOrgPayload {
  id: string;
  name: string;
  slug?: string | null;
  image_url?: string | null;
  max_allowed_memberships?: number | null;
  members_count?: number | null;
}

export async function upsertOrgFromClerk(org: ClerkOrgPayload) {
  const existing = await prisma.customerOrganization.findUnique({
    where: { clerkOrgId: org.id },
  });
  if (existing) {
    return prisma.customerOrganization.update({
      where: { id: existing.id },
      data: {
        name: org.name,
        slug: org.slug ?? existing.slug,
        imageUrl: org.image_url ?? existing.imageUrl,
        maxMembers:
          typeof org.max_allowed_memberships === "number"
            ? org.max_allowed_memberships > 0
              ? org.max_allowed_memberships
              : null
            : existing.maxMembers,
      },
    });
  }
  // Synthesize a slug if Clerk did not supply one.
  const slug = org.slug || `clerk-${org.id.slice(-12).toLowerCase()}`;
  return prisma.customerOrganization.create({
    data: {
      clerkOrgId: org.id,
      name: org.name,
      slug,
      imageUrl: org.image_url ?? null,
      maxMembers:
        typeof org.max_allowed_memberships === "number" &&
        org.max_allowed_memberships > 0
          ? org.max_allowed_memberships
          : null,
      status: "onboarding",
    },
  });
}

export async function deleteOrgFromClerk(clerkOrgId: string) {
  const existing = await prisma.customerOrganization.findUnique({ where: { clerkOrgId } });
  if (!existing) return null;
  return prisma.customerOrganization.update({
    where: { id: existing.id },
    data: { status: "archived" },
  });
}

interface ClerkMembershipPayload {
  id: string;
  organization: { id: string };
  public_user_data?: { user_id: string };
  role?: string;
}

/**
 * Clerk's role taxonomy is coarse (`org:admin` / `org:member`); our local
 * taxonomy is finer (7 customer roles). When we receive a webhook for a
 * membership we don't yet have, we need a default local role:
 *
 *   org:admin  → customer_admin   (full mgmt of the customer org)
 *   org:member → read_only_user   (least-privilege baseline)
 *
 * For *existing* memberships we never demote based on Clerk's signal —
 * Clerk only sees admin-vs-not, so a Clerk role-change shouldn't clobber
 * a richer local role like `compliance_manager`.
 */
function defaultLocalRoleFromClerk(clerkRole: string | undefined): string {
  return clerkRole === "org:admin" ? "customer_admin" : "read_only_user";
}

export async function upsertMembershipFromClerk(membership: ClerkMembershipPayload) {
  const clerkUserId = membership.public_user_data?.user_id;
  if (!clerkUserId) return null;

  // Use the resilient resolver — webhook delivery is unordered, so
  // `organizationMembership.created` can beat `user.created` and the
  // UserProfile may still hold a `pending_*` placeholder. Falling back
  // to email lookup adopts that placeholder instead of silently no-oping.
  const [profile, org] = await Promise.all([
    resolveOrAdoptUserProfile(clerkUserId),
    prisma.customerOrganization.findUnique({
      where: { clerkOrgId: membership.organization.id },
    }),
  ]);
  if (!profile || !org) return null;

  return prisma.orgUserAccess.upsert({
    where: {
      customerOrganizationId_userProfileId: {
        customerOrganizationId: org.id,
        userProfileId: profile.id,
      },
    },
    update: {
      // Do NOT update the local role from Clerk — preserve the finer-grained
      // local role. Only refresh the Clerk membership id + status.
      clerkMembershipId: membership.id,
      status: "active",
    },
    create: {
      customerOrganizationId: org.id,
      userProfileId: profile.id,
      role: defaultLocalRoleFromClerk(membership.role),
      clerkMembershipId: membership.id,
      status: "active",
    },
  });
}

/**
 * Self-heal pass: pull a user's actual Clerk org memberships and
 * activate any local OrgUserAccess rows that are stuck at "invited"
 * (or create them outright when missing). Belt-and-suspenders for the
 * out-of-order-webhook case — even when the webhook handler dropped a
 * membership on the floor, the next time the user lands on /welcome
 * (or any other reconcile point), they get the right access without
 * any admin intervention.
 *
 * Best-effort by design: returns the count of rows updated and never
 * throws — Clerk being temporarily unreachable shouldn't break /welcome.
 */
export async function reconcileUserOrgMembershipsFromClerk(
  clerkUserId: string,
  userProfileId: string,
): Promise<{ activated: number; created: number }> {
  let activated = 0;
  let created = 0;
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const list = await client.users.getOrganizationMembershipList({
      userId: clerkUserId,
    });
    const memberships = list.data ?? [];
    for (const m of memberships) {
      const org = await prisma.customerOrganization.findUnique({
        where: { clerkOrgId: m.organization.id },
      });
      if (!org) continue; // Clerk has an org we don't mirror locally — skip.

      const existing = await prisma.orgUserAccess.findUnique({
        where: {
          customerOrganizationId_userProfileId: {
            customerOrganizationId: org.id,
            userProfileId,
          },
        },
      });

      if (existing) {
        if (existing.status !== "active") {
          await prisma.orgUserAccess.update({
            where: { id: existing.id },
            data: { status: "active", clerkMembershipId: m.id },
          });
          activated += 1;
        }
      } else {
        await prisma.orgUserAccess.create({
          data: {
            customerOrganizationId: org.id,
            userProfileId,
            role: defaultLocalRoleFromClerk(m.role),
            clerkMembershipId: m.id,
            status: "active",
          },
        });
        created += 1;
      }
    }
  } catch (err) {
    console.error(
      `[clerk-sync] reconcileUserOrgMembershipsFromClerk failed for ${clerkUserId}:`,
      err,
    );
  }
  return { activated, created };
}

export async function deleteMembershipFromClerk(membership: ClerkMembershipPayload) {
  const clerkUserId = membership.public_user_data?.user_id;
  if (!clerkUserId) return null;
  const [profile, org] = await Promise.all([
    prisma.userProfile.findUnique({ where: { clerkUserId } }),
    prisma.customerOrganization.findUnique({
      where: { clerkOrgId: membership.organization.id },
    }),
  ]);
  if (!profile || !org) return null;
  return prisma.orgUserAccess.deleteMany({
    where: {
      customerOrganizationId: org.id,
      userProfileId: profile.id,
    },
  });
}

export async function logWebhookEvent(eventType: string, ok: boolean, metadata: object) {
  await writeAuditLog({
    eventType: `clerk_webhook.${eventType}`,
    eventCategory: "system",
    severity: ok ? "info" : "warning",
    action: `Clerk webhook ${eventType}: ${ok ? "processed" : "rejected"}`,
    metadata,
  });
}
