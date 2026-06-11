import { prisma } from "../lib/db/prisma";

const PILOT_CLERK_ORG_ID = "org_3EP8HTLXTm9tfUo3cV36kIGXjwQ";

async function main() {
  const org = await prisma.customerOrganization.findFirst({
    where: { slug: "mactech-solutions-llc-pilot" },
  });
  if (!org) {
    console.log("no pilot org");
    return;
  }
  await prisma.customerOrganization.update({
    where: { id: org.id },
    data: { clerkOrgId: PILOT_CLERK_ORG_ID },
  });
  console.log(JSON.stringify({ fixed: true, hubOrgId: org.id, clerkOrgId: PILOT_CLERK_ORG_ID }));
}

main()
  .finally(() => prisma.$disconnect());
