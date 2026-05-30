/**
 * Safe app launch helper.
 *
 * Verifies the caller has access to the customer org, that the entitlement
 * is enabled, writes an audit log, and redirects to the app's base URL with
 * the customer org's Clerk identifier as opaque context. We never pass
 * sensitive material in the URL.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentAuthContext } from "@/lib/authz";
import { evaluateHubAuthorityRecords } from "@/lib/hub-authority-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { appKey: string } },
) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required." }, { status: 400 });
  }

  const context = await getCurrentAuthContext();
  if (!context) {
    return NextResponse.redirect(new URL("/access-restricted?reason=no_org_access", request.url));
  }

  const [app, org, membership, entitlement] = await Promise.all([
    prisma.appRegistry.findUnique({ where: { appKey: params.appKey } }),
    prisma.customerOrganization.findUnique({ where: { id: orgId } }),
    prisma.orgUserAccess.findUnique({
      where: {
        customerOrganizationId_userProfileId: {
          customerOrganizationId: orgId,
          userProfileId: context.userProfile.id,
        },
      },
    }),
    prisma.productEntitlement.findFirst({
      where: {
        customerOrganizationId: orgId,
        app: { appKey: params.appKey },
      },
    }),
  ]);
  const roleTemplate =
    membership && !Array.isArray(membership.permissionsJson)
      ? await prisma.roleTemplate.findUnique({
          where: { scope_key: { scope: "customer_org", key: membership.role } },
        })
      : null;

  if (!app || !org) {
    return NextResponse.json({ error: "App or org not found." }, { status: 404 });
  }
  const snapshot = evaluateHubAuthorityRecords(
    {
      clerkUserId: context.clerkUserId,
      appKey: params.appKey,
      requestedOrgId: orgId,
      requestId: request.headers.get("x-request-id"),
      sourceIp: getIp(request),
      userAgent: request.headers.get("user-agent"),
      service: { sourceAppKey: "hub", authMethod: "service_token" },
    },
    {
      serviceValid: true,
      sourceAppKnown: true,
      app,
      user: context.userProfile,
      organization: org,
      membership,
      entitlement,
      roleTemplatePermissions: Array.isArray(roleTemplate?.permissionsJson)
        ? roleTemplate.permissionsJson.filter((value): value is string => typeof value === "string")
        : null,
    },
  );
  if (!snapshot.decision.allow) {
    return NextResponse.redirect(
      new URL(`/access-restricted?reason=${snapshot.decision.denyReason}`, request.url),
    );
  }
  if (!app.baseUrl) {
    return NextResponse.json(
      { error: "App has no baseUrl configured in the registry." },
      { status: 500 },
    );
  }

  await writeAuditLog({
    eventType: "app_launch.redirect",
    eventCategory: "system",
    severity: "info",
    action: `Launched ${app.name} for ${org.name}`,
    actorClerkUserId: context.clerkUserId,
    actorEmail: context.userProfile.email,
    actorUserProfileId: context.userProfile.id,
    customerOrganizationId: org.id,
    appRegistryId: app.id,
    resourceType: "AppLaunch",
    resourceId: app.id,
    metadata: { appKey: app.appKey, orgSlug: org.slug },
  });

  const target = new URL(app.baseUrl);
  if (app.requiresOrgContext && org.clerkOrgId) {
    target.searchParams.set("orgId", org.clerkOrgId);
  }
  return NextResponse.redirect(target);
}

function getIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
