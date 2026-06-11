import { createHubAuthorityClient } from "../src/index";

export function createExampleAuthorityClient(appKey: string) {
  return createHubAuthorityClient({
    mode: process.env.HUB_AUTHORITY_MODE === "live" ? "live" : "mock",
    live: {
      hubBaseUrl: process.env.MACTECH_HUB_URL ?? "https://www.suite.mactechsolutionsllc.com",
      sourceAppKey: appKey,
      serviceToken: process.env.MACTECH_HUB_SERVICE_TOKEN,
    },
  });
}

export async function enforceAppAccess(
  appKey: Parameters<ReturnType<typeof createExampleAuthorityClient>["resolveAppAccess"]>[0]["appKey"],
  clerkUserId: string,
  clerkOrgId?: string,
) {
  const client = createExampleAuthorityClient(appKey);
  const snapshot = await client.resolveAppAccess({
    appKey,
    clerkUserId,
    clerkOrgId,
    mode: "user_session",
  });
  if (!snapshot.allowed) {
    throw new Error(snapshot.reason ?? "hub_auth_denied");
  }
  return snapshot;
}
