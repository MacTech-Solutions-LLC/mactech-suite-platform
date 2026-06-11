/**
 * Minimal live-mode satellite wiring — env reads only, no secrets in source.
 * Pre-tenant dev should use HUB_AUTHORITY_MODE=mock (see docs/LIVE_HUB_AUTHORITY_WIRING.md).
 */
import { createHubAuthorityClient, type MacTechAppKey } from "../src/index";

const APP_KEY = (process.env.MACTECH_APP_KEY ?? "training") as MacTechAppKey;

function createSatelliteHubClient() {
  const mode = process.env.HUB_AUTHORITY_MODE === "live" ? "live" : "mock";

  return createHubAuthorityClient({
    mode,
    live:
      mode === "live"
        ? {
            hubBaseUrl: process.env.MACTECH_HUB_URL ?? "",
            sourceAppKey: APP_KEY,
            serviceToken: process.env.MACTECH_HUB_SERVICE_TOKEN,
          }
        : undefined,
  });
}

/** Protected route: Clerk session → Hub authority → domain handler. */
export async function liveModeProtectedRoute(clerkUserId: string, clerkOrgId?: string) {
  const hub = createSatelliteHubClient();
  const snapshot = await hub.resolveAppAccess({
    appKey: APP_KEY,
    clerkUserId,
    clerkOrgId,
    mode: "user_session",
  });

  if (!snapshot.allowed) {
    return { status: 403 as const, reason: snapshot.reason ?? "hub_auth_denied" };
  }

  return {
    status: 200 as const,
    hubUserId: snapshot.user.id,
    hubOrganizationId: snapshot.tenant.organizationId,
    permissions: snapshot.entitlements.flatMap((e) => e.features),
  };
}
