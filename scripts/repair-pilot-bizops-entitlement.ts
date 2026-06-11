/**
 * Brian-authorized ops: remove duplicate pilot org slug + re-upsert bizops entitlement.
 * Usage: railway run npx tsx scripts/repair-pilot-bizops-entitlement.ts
 */
import { prisma } from "../lib/db/prisma";

const PILOT_CLERK_ORG_ID = "org_3EP8HTLXTm9tfUo3cV36kIGXjwQ";
const BAD_SLUG = "mactech-solutions-llc-pilot";

async function main() {
  const bizops = await prisma.appRegistry.findUnique({ where: { appKey: "bizops" } });
  if (!bizops) throw new Error("bizops AppRegistry missing");

  if (bizops.status !== "active") {
    await prisma.appRegistry.update({ where: { appKey: "bizops" }, data: { status: "active" } });
  }

  const pilot = await prisma.customerOrganization.findUnique({
    where: { clerkOrgId: PILOT_CLERK_ORG_ID },
  });
  if (!pilot) throw new Error("Pilot org not found");

  await prisma.customerOrganization.update({
    where: { id: pilot.id },
    data: { status: "active" },
  });

  const bad = await prisma.customerOrganization.findUnique({ where: { slug: BAD_SLUG } });
  if (bad && bad.id !== pilot.id) {
    await prisma.productEntitlement.deleteMany({ where: { customerOrganizationId: bad.id } });
    await prisma.customerOrganization.delete({ where: { id: bad.id } });
    console.error("Removed duplicate pilot org row");
  }

  const row = await prisma.productEntitlement.upsert({
    where: {
      customerOrganizationId_appRegistryId: {
        customerOrganizationId: pilot.id,
        appRegistryId: bizops.id,
      },
    },
    update: { enabled: true, status: "active", plan: "starter" },
    create: {
      customerOrganizationId: pilot.id,
      appRegistryId: bizops.id,
      enabled: true,
      status: "active",
      plan: "starter",
    },
  });

  console.log(
    JSON.stringify({
      ok: true,
      hubOrgId: pilot.id,
      clerkOrgId: pilot.clerkOrgId,
      orgName: pilot.name,
      entitlementId: row.id,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
