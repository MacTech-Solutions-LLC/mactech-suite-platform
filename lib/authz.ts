/**
 * Centralized authorization helpers for the Identity Command Center.
 *
 * `getCurrentAuthContext()` resolves the Clerk session into a fully-typed
 * MacTech auth context that includes the local UserProfile and platform
 * permissions. Every server action, API route, and admin page must call
 * one of the `require*` guards before acting — Clerk session alone is
 * never sufficient authority.
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "./db/prisma";
import {
  PLATFORM_ROLE_PERMISSIONS,
  type PlatformPermission,
  type OrgPermission,
} from "./permissions";
import type { PlatformRole, UserProfile } from "@prisma/client";

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "unauthenticated"
      | "no_profile"
      | "no_platform_access"
      | "permission_denied"
      | "no_org_access" = "permission_denied",
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export interface CommandCenterAuthContext {
  clerkUserId: string;
  clerkOrgId: string | null;
  userProfile: UserProfile;
  isInternalMacTech: boolean;
  platformRole: PlatformRole;
  permissions: PlatformPermission[];
}

/**
 * Resolve the current request's auth context. Returns null when there is
 * no Clerk session at all.
 *
 * If the Clerk session is valid but no local UserProfile exists, this
 * function auto-provisions a baseline row (`isInternalMacTechUser=false`,
 * `platformRole=none`, `status=active`) by fetching the user's email
 * from Clerk. This eliminates the dead-end "ask a Super Admin" page that
 * appeared whenever the Clerk → /api/webhooks/clerk delivery failed
 * (which has been flaky on our instance). The newly created user still
 * hits /access-restricted (correct — they don't have a platform role
 * yet), but now the row exists so an admin can promote them via
 * /admin/users without manual SQL.
 *
 * Throws nothing for "logged in but unauthorized" — callers decide
 * whether that's an error or a redirect.
 */
export async function getCurrentAuthContext(): Promise<CommandCenterAuthContext | null> {
  const session = await auth();
  if (!session.userId) return null;

  let profile = await prisma.userProfile.findUnique({
    where: { clerkUserId: session.userId },
  });

  if (!profile) {
    profile = await autoProvisionFromClerk(session.userId);
    if (!profile) return null;
  }

  // Best-effort lastSeenAt update; failures should not block auth.
  prisma.userProfile
    .update({
      where: { id: profile.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {
      /* no-op */
    });

  return {
    clerkUserId: session.userId,
    clerkOrgId: session.orgId ?? null,
    userProfile: profile,
    isInternalMacTech: profile.isInternalMacTechUser,
    platformRole: profile.platformRole,
    permissions: PLATFORM_ROLE_PERMISSIONS[profile.platformRole] ?? [],
  };
}

/**
 * Lazy webhook fallback. Pulls the user's email + name from Clerk's API
 * and upserts a baseline UserProfile so the rest of the request can
 * resolve. Idempotent on email — if a stale row exists for this email
 * (e.g. invited but never signed in), claim it instead of inserting a
 * duplicate which would violate the unique-email constraint.
 */
async function autoProvisionFromClerk(clerkUserId: string): Promise<UserProfile | null> {
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const cu = await client.users.getUser(clerkUserId);
    const primary =
      cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId) ??
      cu.emailAddresses[0];
    const email = primary?.emailAddress;
    if (!email) {
      console.warn(
        `[authz] auto-provision skipped for ${clerkUserId}: no email on Clerk profile`,
      );
      return null;
    }

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
    console.error(`[authz] auto-provision failed for ${clerkUserId}:`, err);
    return null;
  }
}

/**
 * Like getCurrentAuthContext but also requires authentication.
 * Throws AuthorizationError("unauthenticated") if no session.
 */
export async function requireAuthContext(): Promise<CommandCenterAuthContext> {
  const ctx = await getCurrentAuthContext();
  if (!ctx) {
    throw new AuthorizationError(
      "Authentication required to access the Identity Command Center.",
      "unauthenticated",
    );
  }
  return ctx;
}

export async function requirePlatformPermission(
  permission: PlatformPermission,
): Promise<CommandCenterAuthContext> {
  const ctx = await requireAuthContext();
  if (!ctx.isInternalMacTech) {
    throw new AuthorizationError(
      "This action requires MacTech internal admin access.",
      "no_platform_access",
    );
  }
  if (ctx.userProfile.status !== "active") {
    throw new AuthorizationError(
      "Your MacTech account is not active.",
      "permission_denied",
    );
  }
  if (!ctx.permissions.includes(permission)) {
    throw new AuthorizationError(
      `Permission denied: ${permission}`,
      "permission_denied",
    );
  }
  return ctx;
}

export async function requireMacTechAdmin(): Promise<CommandCenterAuthContext> {
  const ctx = await requireAuthContext();
  if (!ctx.isInternalMacTech || ctx.userProfile.status !== "active") {
    throw new AuthorizationError(
      "MacTech admin access required.",
      "no_platform_access",
    );
  }
  return ctx;
}

export async function requireCustomerOrgAccess(
  customerOrgId: string,
): Promise<{
  context: CommandCenterAuthContext;
  orgRole: string;
  orgPermissions: OrgPermission[];
}> {
  const ctx = await requireAuthContext();

  // MacTech admins can access any customer org.
  if (ctx.isInternalMacTech && ctx.userProfile.status === "active") {
    return { context: ctx, orgRole: "mactech", orgPermissions: [] };
  }

  const access = await prisma.orgUserAccess.findFirst({
    where: {
      customerOrganizationId: customerOrgId,
      userProfileId: ctx.userProfile.id,
      status: "active",
    },
  });

  if (!access) {
    throw new AuthorizationError(
      "You do not have access to this customer organization.",
      "no_org_access",
    );
  }

  const orgPermissions = parsePermissions(access.permissionsJson);
  return { context: ctx, orgRole: access.role, orgPermissions };
}

export async function requireOrgPermission(
  customerOrgId: string,
  permission: OrgPermission,
): Promise<{ context: CommandCenterAuthContext; orgRole: string }> {
  const access = await requireCustomerOrgAccess(customerOrgId);
  if (access.context.isInternalMacTech) {
    return { context: access.context, orgRole: access.orgRole };
  }
  if (!access.orgPermissions.includes(permission)) {
    throw new AuthorizationError(
      `Permission denied for org ${customerOrgId}: ${permission}`,
      "permission_denied",
    );
  }
  return { context: access.context, orgRole: access.orgRole };
}

export async function isMacTechAdmin(): Promise<boolean> {
  try {
    const ctx = await getCurrentAuthContext();
    return Boolean(
      ctx?.isInternalMacTech &&
        ctx.userProfile.status === "active" &&
        ctx.platformRole !== "none",
    );
  } catch {
    return false;
  }
}

export async function canManageCustomerOrg(_customerOrgId: string): Promise<boolean> {
  try {
    const ctx = await getCurrentAuthContext();
    if (!ctx) return false;
    return ctx.permissions.includes("platform:customer_orgs:update");
  } catch {
    return false;
  }
}

export async function canViewAuditLogs(): Promise<boolean> {
  try {
    const ctx = await getCurrentAuthContext();
    if (!ctx) return false;
    return ctx.permissions.includes("platform:audit_logs:view");
  } catch {
    return false;
  }
}

export function hasPlatformPermission(
  ctx: CommandCenterAuthContext | null,
  permission: PlatformPermission,
): boolean {
  if (!ctx) return false;
  return ctx.permissions.includes(permission);
}

function parsePermissions(value: unknown): OrgPermission[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is OrgPermission => typeof v === "string");
}
