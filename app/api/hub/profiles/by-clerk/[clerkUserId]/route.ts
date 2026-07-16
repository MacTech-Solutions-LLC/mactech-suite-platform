import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { serialiseProfile } from "@/lib/member-profile-core";

/**
 * Read a member capability profile by Clerk user id (ADR-0003).
 *
 * The sibling route keys on `hubUserId` (`UserProfile.id`), which is what a
 * writer holds: bizops gets it as `canonicalHubUserId` on every authority
 * snapshot. A *consumer* usually doesn't. CaptureOS authenticates with Clerk
 * and stores `users.clerk_user_id`; it never sees a Hub id, and making it ask
 * for one would mean inventing a second link to maintain — a column, a
 * backfill, and an email match to populate it. All of that to rediscover an
 * identifier both systems already share.
 *
 * `UserProfile.clerkUserId` is unique, so this is a lookup, not a guess. That
 * is the whole point: a link derived from Clerk cannot attach one person's
 * profile to another, which an email match absolutely can.
 *
 * Read-only, deliberately. Writers address a profile by the canonical id — a
 * PUT that resolved identity through a second key would give the same record
 * two write paths to disagree over.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ clerkUserId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiKey(request, "profile_read");
  if (!auth.ok) return auth.response;

  const { clerkUserId } = await context.params;

  const user = await prisma.userProfile.findUnique({
    where: { clerkUserId },
    select: { capabilityProfile: { include: { naics: true } } },
  });

  // One 404 for "no such Clerk user" and "user has no profile" alike. A caller
  // holding a profile_read key should not be able to enumerate which Clerk ids
  // exist in the Suite by watching status codes.
  if (!user?.capabilityProfile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(serialiseProfile(user.capabilityProfile));
}
