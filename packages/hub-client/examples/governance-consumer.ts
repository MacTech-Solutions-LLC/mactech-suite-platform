import { enforceAppAccess } from "./shared";

/** GovernanceOS satellite — Next.js route handler pattern (appKey: governance). */
export async function governanceProtectedRoute(request: Request) {
  const snapshot = await enforceAppAccess(
    "governance",
    request.headers.get("x-clerk-user-id") ?? "",
    request.headers.get("x-clerk-org-id") ?? undefined,
  );
  return Response.json({
    ok: true,
    entitlements: snapshot.entitlements.map((item) => item.appKey),
    permissions: snapshot.entitlements[0]?.features ?? [],
  });
}
