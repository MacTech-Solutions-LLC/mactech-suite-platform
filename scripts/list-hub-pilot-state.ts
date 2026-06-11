import { prisma } from "../lib/db/prisma";

async function main() {
  const orgs = await prisma.customerOrganization.findMany({
    select: { id: true, name: true, slug: true, clerkOrgId: true, status: true },
  });
  const ents = await prisma.productEntitlement.findMany({
    where: { app: { appKey: "bizops" } },
    select: {
      id: true,
      enabled: true,
      status: true,
      customerOrganization: { select: { name: true, clerkOrgId: true } },
    },
  });
  console.log(JSON.stringify({ orgs, entitlements: ents }, null, 2));
}

main().finally(() => prisma.$disconnect());
