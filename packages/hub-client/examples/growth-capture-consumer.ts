import { enforceAppAccess } from "./shared";

/** Opportunity & Capture satellite (appKey: growth-capture). */
export async function growthCaptureProtectedRoute(request: Request) {
  const snapshot = await enforceAppAccess(
    "growth-capture",
    request.headers.get("x-clerk-user-id") ?? "",
    request.headers.get("x-clerk-org-id") ?? undefined,
  );
  return Response.json({
    ok: true,
    hubUserId: snapshot.user.id,
    hubOrganizationId: snapshot.tenant.organizationId,
  });
}
