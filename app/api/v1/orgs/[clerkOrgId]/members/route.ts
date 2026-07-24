/**
 * GET /api/v1/orgs/{orgId}/members
 *
 * Member roster for sibling apps. The Hub is the identity authority — sibling
 * apps hold only opaque hub user ids — so this is where an app like BizOps
 * asks "who is in this org, and what are their names?" for a team roster.
 *
 * The path segment accepts either the canonical CustomerOrganization id (what
 * the authority snapshot hands sibling apps as `tenant.organizationId`) or the
 * Clerk org id, matching the flexibility of the parent org route's callers.
 *
 * Auth: same `org_read` scope as GET /api/v1/orgs/{clerkOrgId} — the roster is
 * org metadata, not profile content.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { consumeRateLimit, rate429Response } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { clerkOrgId: string } },
) {
  const auth = await requireApiKey(request, "org_read");
  if (!auth.ok) return auth.response;

  const rl = consumeRateLimit({
    key: `org-members:${auth.apiKeyId ?? auth.apiKeyName}`,
    limit: 300,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rate429Response(rl);

  // Canonical id first (what authority snapshots carry), Clerk org id second.
  const org =
    (await prisma.customerOrganization.findUnique({
      where: { id: params.clerkOrgId },
      select: { id: true, clerkOrgId: true },
    })) ??
    (await prisma.customerOrganization.findUnique({
      where: { clerkOrgId: params.clerkOrgId },
      select: { id: true, clerkOrgId: true },
    }));

  if (!org) {
    return NextResponse.json({ error: "org_not_found" }, { status: 404 });
  }

  const access = await prisma.orgUserAccess.findMany({
    where: { customerOrganizationId: org.id },
    include: {
      userProfile: {
        select: {
          id: true,
          clerkUserId: true,
          email: true,
          firstName: true,
          lastName: true,
          imageUrl: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    ok: true,
    organizationId: org.id,
    clerkOrgId: org.clerkOrgId,
    members: access.map((a) => ({
      // The canonical hub user id — the join key sibling apps store.
      hubUserId: a.userProfile.id,
      clerkUserId: a.userProfile.clerkUserId,
      email: a.userProfile.email,
      firstName: a.userProfile.firstName,
      lastName: a.userProfile.lastName,
      imageUrl: a.userProfile.imageUrl,
      role: a.role,
      membershipStatus: a.status,
      userStatus: a.userProfile.status,
    })),
  });
}
