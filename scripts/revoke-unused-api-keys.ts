/**
 * Revoke never-used Hub API keys (ops tooling).
 *
 * Repeated runs of issue-app-hub-token.ts leave behind keys that were issued,
 * never distributed to the app, and never revoked. They are indistinguishable
 * from live keys in the admin list, and every one of them is a working
 * credential for its app tag. This revokes them.
 *
 * Safety model — a key is only revoked if ALL of these hold, re-checked inside
 * the write transaction so a key that authenticates mid-run is left alone:
 *
 *   - status is active
 *   - lastUsedAt IS NULL — it has never authenticated, so nothing can break
 *   - createdAt is older than --min-age-days (default 7), so a key issued
 *     during an in-flight rollout isn't revoked before the app adopts it
 *
 * Dry-run is the default. Pass --execute to write.
 *
 * Usage:
 *   railway run npx tsx scripts/revoke-unused-api-keys.ts
 *   railway run npx tsx scripts/revoke-unused-api-keys.ts --execute
 *
 * Requires DATABASE_URL in the environment.
 */

import { prisma } from "../lib/db/prisma";
import { writeAuditLog } from "../lib/audit";

const DEFAULT_MIN_AGE_DAYS = 7;

type Options = { execute: boolean; minAgeDays: number; actorEmail: string | null; help: boolean };

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    execute: false,
    minAgeDays: DEFAULT_MIN_AGE_DAYS,
    actorEmail: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute") opts.execute = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--min-age-days") {
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        console.error(`--min-age-days expects a non-negative number, got: ${raw}`);
        process.exit(1);
      }
      opts.minAgeDays = n;
    } else if (arg === "--actor-email") {
      opts.actorEmail = argv[++i] ?? null;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return opts;
}

function usage() {
  console.log(`revoke-unused-api-keys — revoke never-used Hub API keys

USAGE
  railway run npx tsx scripts/revoke-unused-api-keys.ts [options]

OPTIONS
  --help, -h            Show this help and exit
  --execute             Actually revoke. Without this, prints the plan only.
  --min-age-days <num>  Only revoke keys older than this (default: ${DEFAULT_MIN_AGE_DAYS}).
                        Protects keys issued during an in-flight rollout.
  --actor-email <email> Attribute the audit entries to this operator.

SAFETY
  Only keys with lastUsedAt IS NULL are eligible — a key that has ever
  authenticated is never touched. The condition is re-checked inside the
  write transaction.`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();

  const cutoff = new Date(Date.now() - opts.minAgeDays * 24 * 60 * 60 * 1000);

  const candidates = await prisma.apiKey.findMany({
    where: { status: "active", lastUsedAt: null, createdAt: { lt: cutoff } },
    orderBy: [{ appKey: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, keyPrefix: true, appKey: true, scopes: true, createdAt: true },
  });

  // Surface keys that are never-used but too new to touch, so a short
  // --min-age-days isn't silently hiding them from the operator.
  const tooNew = await prisma.apiKey.count({
    where: { status: "active", lastUsedAt: null, createdAt: { gte: cutoff } },
  });

  console.log(
    `${opts.execute ? "EXECUTE" : "DRY RUN"} — never-used active keys older than ${opts.minAgeDays}d\n`,
  );

  if (candidates.length === 0) {
    console.log("Nothing to revoke.");
  } else {
    for (const k of candidates) {
      console.log(
        `   ${(k.appKey ?? "(untagged)").padEnd(20)} ${k.keyPrefix.padEnd(14)} created=${k.createdAt
          .toISOString()
          .slice(0, 16)
          .replace("T", " ")}  ${k.name}`,
      );
    }
  }
  console.log(`\nEligible: ${candidates.length}`);
  if (tooNew > 0) {
    console.log(`Skipped (never used but newer than ${opts.minAgeDays}d): ${tooNew}`);
  }

  if (!opts.execute) {
    console.log("\nDry run — nothing written. Re-run with --execute to revoke.");
    return;
  }

  let revoked = 0;
  let raced = 0;
  for (const k of candidates) {
    // Conditional update: if the key authenticated between the read above and
    // now, lastUsedAt is no longer null and this matches zero rows.
    const result = await prisma.apiKey.updateMany({
      where: { id: k.id, status: "active", lastUsedAt: null },
      data: { status: "revoked" },
    });

    if (result.count === 0) {
      console.log(`   SKIPPED (used since scan): ${k.appKey ?? "(untagged)"} ${k.keyPrefix}`);
      raced++;
      continue;
    }

    await writeAuditLog({
      eventType: "api_key.revoked",
      eventCategory: "system",
      severity: "warning",
      action: `Revoked never-used API key '${k.name}' (${k.keyPrefix}…) via revoke-unused-api-keys ops script`,
      actorEmail: opts.actorEmail,
      resourceType: "ApiKey",
      resourceId: k.id,
      metadata: {
        keyPrefix: k.keyPrefix,
        appKey: k.appKey,
        scopes: k.scopes,
        reason: "never_used",
        script: "revoke-unused-api-keys",
      },
    });
    revoked++;
  }

  console.log(`\nRevoked: ${revoked}${raced > 0 ? `   Skipped (raced): ${raced}` : ""}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
