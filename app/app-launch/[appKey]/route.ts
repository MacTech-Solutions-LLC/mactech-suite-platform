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
import { requireCustomerOrgAccess } from "@/lib/authz";

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

  let access;
  try {
    access = await requireCustomerOrgAccess(orgId);
  } catch (err) {
    return NextResponse.redirect(new URL("/access-restricted?reason=no_org_access", request.url));
  }

  const [app, org, entitlement] = await Promise.all([
    prisma.appRegistry.findUnique({ where: { appKey: params.appKey } }),
    prisma.customerOrganization.findUnique({ where: { id: orgId } }),
    prisma.productEntitlement.findFirst({
      where: {
        customerOrganizationId: orgId,
        app: { appKey: params.appKey },
      },
    }),
  ]);

  if (!app || !org) {
    return NextResponse.json({ error: "App or org not found." }, { status: 404 });
  }
  if (!entitlement?.enabled || entitlement.status !== "active") {
    return NextResponse.redirect(
      new URL("/access-restricted?reason=permission_denied", request.url),
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
    actorClerkUserId: access.context.clerkUserId,
    actorEmail: access.context.userProfile.email,
    actorUserProfileId: access.context.userProfile.id,
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
