import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiKey } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import {
  normaliseNaicsCodes,
  putProfileSchema,
  serialiseProfile,
} from "@/lib/member-profile-core";

/**
 * Member capability profile — the suite-wide read/write surface (ADR-0003).
 *
 * REST rather than a `hub-client` method on purpose: `hub-client` is a
 * TypeScript package, and the first consumer (CaptureOS) has a Python API. A
 * typed wrapper lands in `hub-client` later, but *this* is the contract, and it
 * has to stay callable with a bare HTTP client.
 *
 * `hubUserId` is `UserProfile.id` — the same value satellites already receive as
 * `canonicalHubUserId` on an authority snapshot, so a caller needs no new lookup
 * to address a profile it already has a snapshot for.
 *
 * What this endpoint will not do:
 *   - Return name or email. Identity is UserProfile's, not the profile's. A
 *     satellite that needs a display name asks the identity surface for it.
 *     This is what lets bizops own capability data while holding no PII.
 *   - Accept a title for a NAICS code. Codes only — the writer validates
 *     against its own table and consumers look titles up locally, so a NAICS
 *     revision can't strand a stale title in three databases.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ hubUserId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiKey(request, "profile_read");
  if (!auth.ok) return auth.response;

  const { hubUserId } = await context.params;

  const profile = await prisma.memberCapabilityProfile.findUnique({
    where: { userProfileId: hubUserId },
    include: { naics: true },
  });

  if (!profile) {
    // 404 for "no profile yet" and for "no such user" alike: a caller holding a
    // profile_read key learning which user ids exist is not information this
    // endpoint needs to leak.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(serialiseProfile(profile));
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiKey(request, "profile_write");
  if (!auth.ok) return auth.response;

  const { hubUserId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = putProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const user = await prisma.userProfile.findUnique({
    where: { id: hubUserId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "unknown_hub_user" }, { status: 404 });
  }

  const input = parsed.data;
  // De-dupe while preserving the caller's ranking — the first occurrence wins,
  // because that is the strongest claim the member made for that code.
  const codes = normaliseNaicsCodes(input.naicsCodes);

  const profile = await prisma.$transaction(async (tx) => {
    const saved = await tx.memberCapabilityProfile.upsert({
      where: { userProfileId: hubUserId },
      create: {
        userProfileId: hubUserId,
        headline: input.headline ?? null,
        summary: input.summary ?? null,
        laborCategory: input.laborCategory ?? null,
        yearsExperience: input.yearsExperience ?? null,
        sourceAppKey: auth.apiKeyApp ?? null,
        confirmedAt: input.confirmedAt ? new Date(input.confirmedAt) : null,
      },
      update: {
        headline: input.headline ?? null,
        summary: input.summary ?? null,
        laborCategory: input.laborCategory ?? null,
        yearsExperience: input.yearsExperience ?? null,
        sourceAppKey: auth.apiKeyApp ?? null,
        confirmedAt: input.confirmedAt ? new Date(input.confirmedAt) : null,
      },
    });

    // Full replacement, matching the writer's own semantics: the member
    // reviewed a complete set, so a code absent from the payload is one they
    // removed. Rank is re-derived from position rather than trusted from the
    // client, so the stored order always matches the order that was sent.
    await tx.memberCapabilityNaics.deleteMany({ where: { profileId: saved.id } });
    if (codes.length > 0) {
      await tx.memberCapabilityNaics.createMany({
        data: codes.map((code, rank) => ({ profileId: saved.id, code, rank })),
      });
    }

    return tx.memberCapabilityProfile.findUniqueOrThrow({
      where: { id: saved.id },
      include: { naics: true },
    });
  });

  await writeAuditLog({
    eventType: "member_capability_profile.upserted",
    eventCategory: "user",
    action: "member_capability_profile.upserted",
    actorUserProfileId: hubUserId,
    resourceType: "MemberCapabilityProfile",
    resourceId: profile.id,
    // The profile's *contents* are the member's capability claims; the trail
    // records that a write happened and by whom, not what was said.
    metadata: {
      sourceAppKey: auth.apiKeyApp ?? null,
      apiKeyId: auth.apiKeyId,
      naicsCount: codes.length,
    },
  });

  return NextResponse.json(serialiseProfile(profile));
}
