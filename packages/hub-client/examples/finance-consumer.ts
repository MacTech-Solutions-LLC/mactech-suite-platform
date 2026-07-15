import { enforceAppAccess } from "./shared";

/** Finance satellite (appKey: finance). */
export async function financeProtectedRoute(request: Request) {
  const snapshot = await enforceAppAccess(
    "finance",
    request.headers.get("x-clerk-user-id") ?? "",
    request.headers.get("x-clerk-org-id") ?? undefined,
  );
  return Response.json({
    ok: true,
    hubUserId: snapshot.user.id,
    planFeatures: snapshot.entitlements[0]?.features ?? [],
  });
}
