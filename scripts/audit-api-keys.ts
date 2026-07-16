/**
 * Read-only audit of issued Hub API keys (ops tooling).
 *
 * Reports active keys grouped by app tag, flags never-used keys, and lists the
 * AppRegistry / ServiceIdentity rows they should correspond to. Repeated ops
 * script runs leave behind never-used duplicates, and app renames leave two
 * live tags for one app — both are invisible in the admin list until you group
 * by tag, which is what this does.
 *
 * Writes nothing. Safe to run against production.
 *
 * Usage:
 *   railway run npx tsx scripts/audit-api-keys.ts
 *
 * Requires DATABASE_URL in the environment.
 */

import { prisma } from "../lib/db/prisma";

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  appKey: string | null;
  scopes: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
};

const stamp = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "NEVER");

async function main() {
  const keys: KeyRow[] = await prisma.apiKey.findMany({
    where: { status: "active" },
    orderBy: [{ appKey: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      appKey: true,
      scopes: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  const byApp = new Map<string, KeyRow[]>();
  for (const k of keys) {
    const tag = k.appKey ?? "(untagged)";
    const list = byApp.get(tag) ?? [];
    list.push(k);
    byApp.set(tag, list);
  }

  console.log(`ACTIVE KEYS: ${keys.length} across ${byApp.size} tags\n`);

  const neverUsed: KeyRow[] = [];
  for (const [tag, list] of Array.from(byApp.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const flag = list.length > 1 ? `  <-- ${list.length} keys for one app` : "";
    console.log(`${tag}${flag}`);
    for (const k of list) {
      console.log(
        `   ${k.keyPrefix.padEnd(14)} used=${stamp(k.lastUsedAt).padEnd(17)} created=${stamp(k.createdAt)}  [${k.scopes.join(", ")}]`,
      );
      if (!k.lastUsedAt) neverUsed.push(k);
    }
    console.log("");
  }

  console.log(`--- NEVER-USED ACTIVE KEYS: ${neverUsed.length} (safe to revoke) ---`);
  for (const k of neverUsed) {
    console.log(
      `   ${(k.appKey ?? "(untagged)").padEnd(20)} ${k.keyPrefix.padEnd(14)} created=${stamp(k.createdAt)}  id=${k.id}`,
    );
  }

  const apps = await prisma.appRegistry.findMany({
    select: { appKey: true, name: true, status: true },
    orderBy: { appKey: "asc" },
  });
  console.log(`\n--- APP REGISTRY (${apps.length}) ---`);
  for (const a of apps) {
    console.log(`   ${a.appKey.padEnd(20)} ${a.status.padEnd(10)} ${a.name}`);
  }

  const svc = await prisma.serviceIdentity.findMany({
    select: { appKey: true, status: true },
    orderBy: { appKey: "asc" },
  });
  console.log(`\n--- SERVICE IDENTITIES (${svc.length}) ---`);
  for (const s of svc) {
    console.log(`   ${s.appKey.padEnd(20)} ${s.status}`);
  }

  // A key tag with no AppRegistry row can never pass verifyHubServiceRequest,
  // which requires an active registry row for the source app.
  const registryTags = new Set(apps.map((a) => a.appKey));
  const orphans = Array.from(byApp.keys()).filter((t) => t !== "(untagged)" && !registryTags.has(t));
  console.log(`\n--- KEY TAGS WITH NO AppRegistry ROW: ${orphans.length} ---`);
  for (const o of orphans) console.log(`   ${o}`);

  const unkeyed = apps.filter((a) => !byApp.has(a.appKey)).map((a) => a.appKey);
  console.log(`\n--- REGISTERED APPS WITH NO ACTIVE KEY: ${unkeyed.length} ---`);
  for (const u of unkeyed) console.log(`   ${u}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
