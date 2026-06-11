import { enforceAppAccess } from "./shared";

/** PricingOS satellite (appKey: pricing). */
export async function pricingProtectedRoute(request: Request) {
  const snapshot = await enforceAppAccess(
    "pricing",
    request.headers.get("x-clerk-user-id") ?? "",
    request.headers.get("x-clerk-org-id") ?? undefined,
  );
  return Response.json({
    ok: true,
    hubUserId: snapshot.user.id,
    planFeatures: snapshot.entitlements[0]?.features ?? [],
  });
}
