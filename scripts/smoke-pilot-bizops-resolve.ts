/**
 * Brian-authorized ops: in-process resolveHubAppAccess allow/deny smoke for pilot bizops.
 * Usage: railway run npx tsx scripts/smoke-pilot-bizops-resolve.ts
 * Exits 0 when allow + both deny cases pass; 1 otherwise.
 */
import { resolveHubAppAccess, type VerifiedHubService } from "../lib/hub-authority";
import { prisma } from "../lib/db/prisma";

const PILOT_CLERK_USER_ID = "user_3DsUKUnHXxKdMCGphSlyoMljzwO";
const PILOT_CLERK_ORG_ID = "org_3EP8HTLXTm9tfUo3cV36kIGXjwQ";

const service: VerifiedHubService = {
  ok: true,
  keyId: "smoke-local",
  keyName: "smoke-local",
  sourceAppKey: "bizops",
  serviceIdentityId: "smoke-local",
};

async function resolve(clerkUserId: string, requestedOrgId: string) {
  return resolveHubAppAccess(
    {
      clerkUserId,
      appKey: "bizops",
      requestedOrgId,
      service: { sourceAppKey: "bizops", authMethod: "service_token" },
    },
    service,
  );
}

async function main() {
  const allow = await resolve(PILOT_CLERK_USER_ID, PILOT_CLERK_ORG_ID);
  const denyWrongOrg = await resolve(
    PILOT_CLERK_USER_ID,
    "org_00000000000000000000000000",
  );
  const denyFakeUser = await resolve(
    "user_00000000000000000000000000",
    PILOT_CLERK_ORG_ID,
  );

  const result = {
    allow: {
      pass: allow.decision.allow,
      outcome: allow.decision.outcome,
      denyReason: allow.decision.denyReason,
      canonicalOrganizationId: allow.canonicalOrganizationId,
      canonicalHubUserId: allow.canonicalHubUserId,
    },
    denyWrongOrg: {
      pass: !denyWrongOrg.decision.allow,
      denyReason: denyWrongOrg.decision.denyReason,
    },
    denyFakeUser: {
      pass: !denyFakeUser.decision.allow,
      denyReason: denyFakeUser.decision.denyReason,
    },
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.allow.pass || !result.denyWrongOrg.pass || !result.denyFakeUser.pass) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
