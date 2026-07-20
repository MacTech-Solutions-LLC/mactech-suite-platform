import { prisma } from "@/lib/db/prisma";
import { AuthorizationError, requireAuthContext } from "@/lib/authz";
import { env } from "@/lib/env";

export const AI_APP_KEY = "mactech-ai";

export interface AiAuthority {
  actorUserId: string;
  clerkUserId: string;
  actorEmail: string;
  canonicalOrganizationId: string;
  tenantName: string;
  roles: string[];
  permissions: string[];
  isInternalMacTech: boolean;
  appRegistryId: string;
}

export interface AiAuthorityRecords {
  userActive: boolean;
  organizationActive: boolean;
  membershipActive: boolean;
  appActive: boolean;
  entitlementActive: boolean;
  permissions: string[];
}

export function evaluateAiAuthority(records: AiAuthorityRecords, requiredPermission: string): { allow: boolean; reason?: string } {
  if (!records.userActive) return { allow: false, reason: "user_inactive" };
  if (!records.organizationActive) return { allow: false, reason: "organization_inactive" };
  if (!records.membershipActive) return { allow: false, reason: "membership_inactive" };
  if (!records.appActive) return { allow: false, reason: "app_inactive" };
  if (!records.entitlementActive) return { allow: false, reason: "entitlement_inactive" };
  if (!records.permissions.includes(requiredPermission)) return { allow: false, reason: "permission_denied" };
  return { allow: true };
}

export async function resolveAiAuthority(organizationId: string, requiredPermission: string): Promise<AiAuthority> {
  const ctx = await requireAuthContext();
  const [organization, app, membership] = await Promise.all([
    prisma.customerOrganization.findUnique({ where: { id: organizationId } }),
    prisma.appRegistry.findUnique({ where: { appKey: AI_APP_KEY } }),
    prisma.orgUserAccess.findUnique({
      where: { customerOrganizationId_userProfileId: { customerOrganizationId: organizationId, userProfileId: ctx.userProfile.id } },
    }),
  ]);
  const entitlement = organization && app
    ? await prisma.productEntitlement.findUnique({
        where: { customerOrganizationId_appRegistryId: { customerOrganizationId: organization.id, appRegistryId: app.id } },
      })
    : null;
  const membershipPermissions = parsePermissions(membership?.permissionsJson);
  const permissions = ctx.isInternalMacTech ? ctx.permissions : membershipPermissions;
  const internalMembership = ctx.isInternalMacTech && organization?.isInternalMacTech === true;
  const decision = evaluateAiAuthority({
    userActive: ctx.userProfile.status === "active",
    organizationActive: organization?.status === "active",
    membershipActive: internalMembership || membership?.status === "active",
    appActive: app?.status === "active",
    entitlementActive: internalMembership || usableEntitlement(entitlement),
    permissions,
  }, requiredPermission);
  if (!decision.allow || !organization || !app) {
    throw new AuthorizationError(`MacTech AI access denied: ${decision.reason ?? "authority_unresolved"}`, "permission_denied");
  }
  return {
    actorUserId: ctx.userProfile.id,
    clerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    canonicalOrganizationId: organization.id,
    tenantName: organization.name,
    roles: ctx.isInternalMacTech ? [ctx.platformRole] : membership?.role ? [membership.role] : [],
    permissions,
    isInternalMacTech: ctx.isInternalMacTech,
    appRegistryId: app.id,
  };
}

export async function assertToolEntitlement(authority: AiAuthority, appKey: string): Promise<void> {
  const app = await prisma.appRegistry.findUnique({ where: { appKey } });
  const explicitDevelopmentApp =
    app?.status === "development" && env.NODE_ENV === "development" && env.AI_DEVELOPMENT_MODE;
  if (!app || (app.status !== "active" && !explicitDevelopmentApp)) {
    throw new AuthorizationError(`Tool source app ${appKey} is unavailable.`, "permission_denied");
  }
  if (authority.isInternalMacTech) return;
  const entitlement = await prisma.productEntitlement.findUnique({
    where: { customerOrganizationId_appRegistryId: { customerOrganizationId: authority.canonicalOrganizationId, appRegistryId: app.id } },
  });
  if (!usableEntitlement(entitlement)) throw new AuthorizationError(`Missing active ${appKey} entitlement.`, "permission_denied");
}

function parsePermissions(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function usableEntitlement(value: { enabled: boolean; status: string; startsAt: Date | null; expiresAt: Date | null } | null): boolean {
  if (!value?.enabled || !["active", "trialing"].includes(value.status)) return false;
  const now = new Date();
  return (!value.startsAt || value.startsAt <= now) && (!value.expiresAt || value.expiresAt > now);
}
