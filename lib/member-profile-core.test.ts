import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normaliseNaicsCodes,
  putProfileSchema,
  serialiseProfile,
  type StoredProfileRow,
} from "./member-profile-core";

/**
 * ADR-0003 member capability profile — the rules a consumer depends on.
 *
 * The ordering tests are the load-bearing ones. CaptureOS routes opportunities
 * off NAICS, and `rank` is the member's judgement about what they *are* versus
 * what they can also credibly do. A consumer weighting by position gets that
 * backwards the moment the order stops being the order that was sent.
 */

function row(overrides: Partial<StoredProfileRow> = {}): StoredProfileRow {
  return {
    userProfileId: "usr_abc",
    headline: "Senior Cybersecurity Engineer",
    summary: "Leads RMF and ATO outcomes for DoD systems.",
    laborCategory: "ISSM",
    yearsExperience: 19,
    sourceAppKey: "bizops",
    confirmedAt: new Date("2026-07-15T12:00:00.000Z"),
    updatedAt: new Date("2026-07-16T00:00:00.000Z"),
    naics: [],
    ...overrides,
  };
}

test("NAICS codes serialise in rank order, not the order rows came back", () => {
  // Prisma gives no ordering guarantee on an included relation. If the route
  // ever returns rows as-is, the strongest code stops being first and every
  // position-weighted consumer silently degrades.
  const out = serialiseProfile(
    row({
      naics: [
        { code: "611420", rank: 2 },
        { code: "541512", rank: 0 },
        { code: "541519", rank: 1 },
      ],
    }),
  );
  assert.deepEqual(out.naicsCodes, ["541512", "541519", "611420"]);
});

test("NAICS codes are never sorted lexically", () => {
  // 611420 ranked above 541512 is a real thing a member can assert: a trainer
  // who also engineers. Lexical order would quietly invert that claim.
  const out = serialiseProfile(
    row({
      naics: [
        { code: "611420", rank: 0 },
        { code: "541512", rank: 1 },
      ],
    }),
  );
  assert.deepEqual(out.naicsCodes, ["611420", "541512"]);
});

test("identity is never serialised — no name, no email, no clearance", () => {
  const out = serialiseProfile(row());
  const keys = Object.keys(out);
  for (const forbidden of ["name", "fullName", "email", "clearance", "clearanceLevel"]) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must not be on the wire`);
  }
});

test("de-dupe keeps the first (strongest) occurrence and its position", () => {
  assert.deepEqual(
    normaliseNaicsCodes(["541512", "611420", "541512", "541330"]),
    ["541512", "611420", "541330"],
  );
});

test("unknown years of experience stays null and is never coerced to 0", () => {
  // "Unknown" and "zero years" are different claims; only one is true.
  const parsed = putProfileSchema.parse({ yearsExperience: null, naicsCodes: [] });
  assert.equal(parsed.yearsExperience, null);
  const zero = putProfileSchema.parse({ yearsExperience: 0, naicsCodes: [] });
  assert.equal(zero.yearsExperience, 0, "an asserted zero is still a real answer");
});

test("a code that cannot be NAICS is rejected", () => {
  for (const bad of ["54151", "5415123", "abcdef", "541-512", ""]) {
    const r = putProfileSchema.safeParse({ naicsCodes: [bad] });
    assert.equal(r.success, false, `${JSON.stringify(bad)} must not validate`);
  }
});

test("a real-but-wrong code is accepted — the writer owns that judgement", () => {
  // The Hub owns no NAICS table on purpose. 999999 is six digits and not a real
  // industry; the writer validated against the Census list before sending, and
  // a second copy here would drift and start rejecting codes the writer had
  // correctly accepted. This test pins that boundary so nobody "fixes" it.
  const r = putProfileSchema.safeParse({ naicsCodes: ["999999"] });
  assert.equal(r.success, true);
});

test("an empty NAICS array is a legitimate answer, not a missing field", () => {
  const parsed = putProfileSchema.parse({ naicsCodes: [] });
  assert.deepEqual(parsed.naicsCodes, []);
  const omitted = putProfileSchema.parse({});
  assert.deepEqual(omitted.naicsCodes, [], "omitted defaults to none, never undefined");
});
