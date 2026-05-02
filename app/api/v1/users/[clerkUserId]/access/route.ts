/**
 * GET /api/v1/users/{clerkUserId}/access
 *
 * Public read API. Returns every customer organization the user belongs
 * to, with their org role + the apps that are enabled for that org.
 * Sibling apps use this to make access decisions like:
 *
 *   "Does user X have access to my app within org Y?"
 *
 * Optional query params:
 *   ?clerkOrgId=org_xxx   filter to a single org
 *   ?appKey=cui-vault     filter to a single app
 *
 * Auth: same X-MacTech-Audit-Key as the audit ingest endpoint.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { consumeRateLimit, rate429Response } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { clerkUserId: string } },
) {
  const auth = await requireApiKey(request, "user_access_read");
  if (!auth.ok) return auth.response;

  // 600/min per key — JIT auth in sibling apps may call this on every
  // request before the local user row is cached. Tight enough to bound
  // one buggy app, generous enough for normal traffic.
  const rl = consumeRateLimit({
    key: `access:${auth.apiKeyId ?? auth.apiKeyName}`,
    limit: 600,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rate429Response(rl);

  const profile = await prisma.userProfile.findUnique({
    where: { clerkUserId: params.clerkUserId },
    include: {
      orgAccess: {
        include: {
          customerOrganization: {
            include: {
              entitlements: {
                include: {
                  app: { select: { appKey: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const url = request.nextUrl;
  const filterOrg = url.searchParams.get("clerkOrgId");
  const filterApp = url.searchParams.get("appKey");

  const orgs = profile.orgAccess
    .filter((a) =>
      filterOrg ? a.customerOrganization.clerkOrgId === filterOrg : true,
    )
    .map((a) => {
      const enabledApps = a.customerOrganization.entitlements
        .filter((e) => e.enabled && e.status === "active")
        .filter((e) => (filterApp ? e.app.appKey === filterApp : true))
        .map((e) => ({
          appKey: e.app.appKey,
          appName: e.app.name,
          plan: e.plan,
          status: e.status,
          expiresAt: e.expiresAt,
        }));
      return {
        clerkOrgId: a.customerOrganization.clerkOrgId,
        orgId: a.customerOrganization.id,
        orgName: a.customerOrganization.name,
        orgStatus: a.customerOrganization.status,
        memberStatus: a.status,
        role: a.role,
        permissions: Array.isArray(a.permissionsJson)
          ? (a.permissionsJson as string[])
          : [],
        enabledApps,
      };
    });

  return NextResponse.json({
    ok: true,
    user: {
      clerkUserId: profile.clerkUserId,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      isInternalMacTechUser: profile.isInternalMacTechUser,
      platformRole: profile.platformRole,
      status: profile.status,
    },
    orgs,
  });
}
