/**
 * GET /api/v1/orgs/{clerkOrgId}
 *
 * Public read API for sibling apps. Looks up a CustomerOrganization by
 * Clerk org id and returns the canonical metadata + every product
 * entitlement. Sibling apps use this to ask:
 *   "Is org X currently entitled to my app, with what plan, when does it expire?"
 *
 * Auth: same X-MacTech-Audit-Key as the audit ingest endpoint.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiKey } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { clerkOrgId: string } },
) {
  const auth = await requireApiKey(request, "org_read");
  if (!auth.ok) return auth.response;

  const org = await prisma.customerOrganization.findUnique({
    where: { clerkOrgId: params.clerkOrgId },
    include: {
      entitlements: {
        include: { app: { select: { appKey: true, name: true, status: true } } },
      },
      orgUserAccess: {
        select: { id: true, status: true },
      },
    },
  });

  if (!org) {
    return NextResponse.json({ error: "org_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    org: {
      id: org.id,
      clerkOrgId: org.clerkOrgId,
      name: org.name,
      slug: org.slug,
      legalName: org.legalName,
      domain: org.domain,
      cageCode: org.cageCode,
      uei: org.uei,
      duns: org.duns,
      industry: org.industry,
      customerType: org.customerType,
      status: org.status,
      subscriptionTier: org.subscriptionTier,
      cmmcTargetLevel: org.cmmcTargetLevel,
      cuiBoundaryType: org.cuiBoundaryType,
      maxMembers: org.maxMembers,
      imageUrl: org.imageUrl,
      memberCount: org.orgUserAccess.length,
      activeMemberCount: org.orgUserAccess.filter((a) => a.status === "active")
        .length,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    },
    entitlements: org.entitlements.map((e) => ({
      appKey: e.app.appKey,
      appName: e.app.name,
      appStatus: e.app.status,
      enabled: e.enabled,
      plan: e.plan,
      status: e.status,
      maxUsers: e.maxUsers,
      startsAt: e.startsAt,
      expiresAt: e.expiresAt,
      configuration: e.configurationJson,
    })),
  });
}
