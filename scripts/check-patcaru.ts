import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const email = "patcaru@icloud.com";
  const profile = await prisma.userProfile.findUnique({ where: { email } });
  console.log("=== UserProfile ===");
  if (profile) {
    console.log(`id=${profile.id}`);
    console.log(`clerkUserId=${profile.clerkUserId}`);
    console.log(`status=${profile.status}`);
    console.log(`updatedAt=${profile.updatedAt.toISOString()}`);
  } else {
    console.log("(not found)");
    return;
  }

  console.log("\n=== Recent clerk_webhook audit events (last 20) ===");
  const events = await prisma.auditLog.findMany({
    where: { eventType: { startsWith: "clerk_webhook" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { createdAt: true, eventType: true, severity: true, metadataJson: true },
  });
  for (const e of events) {
    console.log(
      `${e.createdAt.toISOString()}  ${e.severity.padEnd(8)} ${e.eventType}  ${JSON.stringify(e.metadataJson).slice(0, 160)}`,
    );
  }
}
main().finally(() => prisma.$disconnect());
