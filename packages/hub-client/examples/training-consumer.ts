import { enforceAppAccess } from "./shared";

/** Training satellite — protected route middleware pattern (appKey: training). */
export async function trainingProtectedRoute(request: Request) {
  const snapshot = await enforceAppAccess(
    "training",
    request.headers.get("x-clerk-user-id") ?? "",
    request.headers.get("x-clerk-org-id") ?? undefined,
  );
  return Response.json({
    ok: true,
    hubUserId: snapshot.user.id,
    hubOrganizationId: snapshot.tenant.organizationId,
  });
}
