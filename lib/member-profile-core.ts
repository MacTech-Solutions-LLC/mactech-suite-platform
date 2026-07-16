import { z } from "zod";

/**
 * Pure core for the member capability profile surface (ADR-0003).
 *
 * Same split as `hub-audit-core` / `hub-authority-core`: the shape rules and
 * the ordering rules live here, free of Prisma and Next, so they can be tested
 * directly. The route does auth, I/O, and audit; every decision about *what the
 * data means* is in this file.
 */

/**
 * Six digits, and nothing more.
 *
 * The Hub deliberately does **not** check the code against a NAICS table — it
 * doesn't own one, and it shouldn't. The writer owns a table (bizops ships the
 * Census list) and is the authority on whether a code is real; a second,
 * inevitably-drifting copy here would eventually reject codes the writer had
 * correctly validated. This rejects only what cannot be a NAICS code at all.
 */
export const naicsCodeSchema = z.string().regex(/^\d{6}$/, "NAICS code must be 6 digits");

export const putProfileSchema = z.object({
  headline: z.string().trim().max(200).nullable().optional(),
  summary: z.string().trim().max(5_000).nullable().optional(),
  laborCategory: z.string().trim().max(200).nullable().optional(),
  /** Null is "unknown", not zero. Different claims; only one is true. */
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  /** Strongest first. Position is the ranking. */
  naicsCodes: z.array(naicsCodeSchema).max(50).default([]),
  confirmedAt: z.string().datetime().nullable().optional(),
});

export type PutProfileInput = z.infer<typeof putProfileSchema>;

/**
 * De-duplicate while preserving the caller's ranking.
 *
 * First occurrence wins: it is the strongest claim the member made for that
 * code, and a later duplicate is noise, not a demotion.
 */
export function normaliseNaicsCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  return codes.filter((c) => !seen.has(c) && seen.add(c));
}

export interface StoredProfileRow {
  userProfileId: string;
  headline: string | null;
  summary: string | null;
  laborCategory: string | null;
  yearsExperience: number | null;
  sourceAppKey: string | null;
  confirmedAt: Date | null;
  updatedAt: Date;
  naics: Array<{ code: string; rank: number }>;
}

/**
 * The wire shape consumers read.
 *
 * Note what is not here: name, email, clearance. Identity belongs to
 * UserProfile and is resolved separately; clearance is out of scope until it
 * arrives with its own review. A satellite cannot accidentally consume either
 * from this endpoint because neither is ever serialised.
 */
export function serialiseProfile(profile: StoredProfileRow) {
  return {
    hubUserId: profile.userProfileId,
    headline: profile.headline,
    summary: profile.summary,
    laborCategory: profile.laborCategory,
    yearsExperience: profile.yearsExperience,
    // Sorted by rank, never lexically. The order encodes the member's judgement
    // — what they are, then what they can also credibly do — and a consumer
    // weighting by position would silently invert it if we sorted by code.
    naicsCodes: [...profile.naics].sort((a, b) => a.rank - b.rank).map((n) => n.code),
    sourceAppKey: profile.sourceAppKey,
    confirmedAt: profile.confirmedAt?.toISOString() ?? null,
    updatedAt: profile.updatedAt.toISOString(),
  };
}
