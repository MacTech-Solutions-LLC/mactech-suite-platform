/**
 * Read-only verification for greenfield AppRegistry seed rows (Phase 3f).
 *
 * Checks that bizops, contracts-delivery, and client-portal exist with the
 * fixture metadata from prisma/seed.ts (PR #119). Does not insert or update.
 *
 * Usage:
 *   npx tsx scripts/verify-appregistry-seed.ts
 *
 * Requires DATABASE_URL in the environment.
 */

import { PrismaClient } from "@prisma/client";

const GREENFIELD_KEYS = [
  "bizops",
  "contracts-delivery",
  "client-portal",
] as const;

type GreenfieldKey = (typeof GREENFIELD_KEYS)[number];

const EXPECTED: Record<
  GreenfieldKey,
  {
    name: string;
    status: string;
    lifecycle: string;
    subdomain: string;
    repoFullName: string;
  }
> = {
  bizops: {
    name: "BizOps",
    status: "development",
    lifecycle: "development",
    subdomain: "bizops",
    repoFullName: "MacTech-Solutions-LLC/bizops",
  },
  "contracts-delivery": {
    name: "Contracts & Delivery",
    status: "development",
    lifecycle: "development",
    subdomain: "contracts",
    repoFullName: "MacTech-Solutions-LLC/contracts-delivery",
  },
  "client-portal": {
    name: "Client Portal",
    status: "development",
    lifecycle: "development",
    subdomain: "portal",
    repoFullName: "MacTech-Solutions-LLC/client-portal",
  },
};

const prisma = new PrismaClient();

function fieldOk(actual: string | null | undefined, expected: string): boolean {
  return (actual ?? "") === expected;
}

async function main() {
  console.log("=== AppRegistry greenfield seed verification ===\n");

  const rows = await prisma.appRegistry.findMany({
    where: { appKey: { in: [...GREENFIELD_KEYS] } },
    select: {
      appKey: true,
      name: true,
      status: true,
      lifecycle: true,
      subdomain: true,
      repoFullName: true,
    },
    orderBy: { appKey: "asc" },
  });

  const byKey = new Map(rows.map((r) => [r.appKey, r]));
  let failures = 0;

  for (const appKey of GREENFIELD_KEYS) {
    const expected = EXPECTED[appKey];
    const row = byKey.get(appKey);

    if (!row) {
      console.log(`✗ ${appKey}: MISSING`);
      failures++;
      continue;
    }

    const mismatches: string[] = [];
    if (!fieldOk(row.name, expected.name)) mismatches.push(`name`);
    if (!fieldOk(row.status, expected.status)) mismatches.push(`status`);
    if (!fieldOk(row.lifecycle, expected.lifecycle)) mismatches.push(`lifecycle`);
    if (!fieldOk(row.subdomain, expected.subdomain)) mismatches.push(`subdomain`);
    if (!fieldOk(row.repoFullName, expected.repoFullName))
      mismatches.push(`repoFullName`);

    if (mismatches.length === 0) {
      console.log(
        `✓ ${appKey}: FOUND (${row.status}, ${row.lifecycle}, ${row.subdomain})`,
      );
    } else {
      console.log(`✗ ${appKey}: FOUND but mismatch on ${mismatches.join(", ")}`);
      console.log(`    expected: ${JSON.stringify(expected)}`);
      console.log(`    actual:   ${JSON.stringify(row)}`);
      failures++;
    }
  }

  console.log(`\n--- ${rows.length}/${GREENFIELD_KEYS.length} keys present ---`);

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} check(s) did not pass.`);
    console.error("Run npm run db:seed against your dev DATABASE_URL, then retry.");
    process.exitCode = 1;
    return;
  }

  console.log("\nPASSED: all greenfield AppRegistry keys verified.");
}

main()
  .finally(() => prisma.$disconnect())
  .catch((err) => {
    console.error("Verification error:", err);
    process.exit(1);
  });
