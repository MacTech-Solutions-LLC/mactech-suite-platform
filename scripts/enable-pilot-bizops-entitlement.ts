/**
 * Brian-authorized ops: link Clerk pilot org + enable ProductEntitlement for bizops.
 * Usage:
 *   railway run npx tsx scripts/enable-pilot-bizops-entitlement.ts
 *   railway run npx tsx scripts/enable-pilot-bizops-entitlement.ts --org-clerk-id org_xxx
 *
 * When --org-clerk-id is omitted, uses the baked-in pilot Clerk org default.
 */
import { prisma } from "../lib/db/prisma";

const DEFAULT_PILOT_CLERK_ORG_ID = "org_3EP8HTLXTm9tfUo3cV36kIGXjwQ";
const DEFAULT_PILOT_ORG_NAME = "MacTech Solutions LLC";
const DEFAULT_PILOT_ORG_SLUG = "mactech-solutions-llc-pilot";

async function main() {
  const flagIdx = process.argv.indexOf("--org-clerk-id");
  const clerkOrgId =
    flagIdx >= 0 && process.argv[flagIdx + 1]
      ? process.argv[flagIdx + 1]
      : DEFAULT_PILOT_CLERK_ORG_ID;

  const bizops = await prisma.appRegistry.findUnique({ where: { appKey: "bizops" } });
  if (!bizops) {
    console.error("AppRegistry bizops not found");
    process.exit(1);
  }

  if (bizops.status !== "active") {
    await prisma.appRegistry.update({
      where: { appKey: "bizops" },
      data: { status: "active", lifecycle: "production" },
    });
    console.error("Updated AppRegistry bizops -> active");
  }

  let org = await prisma.customerOrganization.findFirst({
    where: { clerkOrgId },
  });

  if (!org) {
    org = await prisma.customerOrganization.create({
      data: {
        clerkOrgId,
        name: DEFAULT_PILOT_ORG_NAME,
        slug: DEFAULT_PILOT_ORG_SLUG,
        status: "active",
        isInternalMacTech: false,
        customerType: "other",
        subscriptionTier: "starter",
      },
    });
    console.error(`Bootstrapped CustomerOrganization for pilot Clerk org: ${org.name}`);
  } else if (org.status !== "active") {
    org = await prisma.customerOrganization.update({
      where: { id: org.id },
      data: { status: "active" },
    });
  }

  const row = await prisma.productEntitlement.upsert({
    where: {
      customerOrganizationId_appRegistryId: {
        customerOrganizationId: org.id,
        appRegistryId: bizops.id,
      },
    },
    update: {
      enabled: true,
      status: "active",
      plan: "starter",
      startsAt: null,
      expiresAt: null,
    },
    create: {
      customerOrganizationId: org.id,
      appRegistryId: bizops.id,
      enabled: true,
      status: "active",
      plan: "starter",
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        orgName: org.name,
        clerkOrgId: org.clerkOrgId,
        hubOrgId: org.id,
        entitlementId: row.id,
        enabled: row.enabled,
        status: row.status,
        appKey: "bizops",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
