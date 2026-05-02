import { cache } from "react";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import type { CommandCenterAuthContext } from "@/lib/authz";

const governanceAppId = cache(async () => {
  const row = await prisma.appRegistry.findUnique({
    where: { appKey: "governance" },
    select: { id: true },
  });
  return row?.id ?? null;
});

/**
 * Records a GovernanceOS UI access event for compliance visibility.
 * Mirrors other suite surfaces that attribute activity to an AppRegistry row.
 */
export async function logGovernancePageAccess(
  ctx: CommandCenterAuthContext,
  pathname: string,
): Promise<void> {
  const appRegistryId = await governanceAppId();
  await writeAuditLog({
    eventType: "governance.page.view",
    eventCategory: "boundary",
    severity: "info",
    action: `GovernanceOS page view: ${pathname}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    appRegistryId,
    resourceType: "GovernancePage",
    resourceId: pathname,
    metadata: { pathname, clerkOrgId: ctx.clerkOrgId },
  });
}
