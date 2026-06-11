/**
 * Brian-authorized ops: diagnostic dump of pilot org entitlements and members.
 * Usage: railway run npx tsx scripts/list-pilot-org-access.ts
 */
import { prisma } from "../lib/db/prisma";

const PILOT_CLERK_ORG_ID = "org_3EP8HTLXTm9tfUo3cV36kIGXjwQ";

async function main() {
  const org = await prisma.customerOrganization.findUnique({
    where: { clerkOrgId: PILOT_CLERK_ORG_ID },
    include: {
      entitlements: { include: { app: true } },
      orgUserAccess: { include: { userProfile: true } },
    },
  });
  if (!org) {
    console.log(JSON.stringify({ ok: false, error: "pilot org not found" }));
    return;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        org: {
          id: org.id,
          name: org.name,
          status: org.status,
          clerkOrgId: org.clerkOrgId,
        },
        entitlements: org.entitlements.map((e) => ({
          id: e.id,
          appKey: e.app.appKey,
          enabled: e.enabled,
          status: e.status,
        })),
        members: org.orgUserAccess.map((a) => ({
          id: a.id,
          status: a.status,
          role: a.role,
          email: a.userProfile.email,
          clerkUserId: a.userProfile.clerkUserId,
          userStatus: a.userProfile.status,
        })),
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
  .finally(() => prisma.$disconnect());
