import { enforceAppAccess } from "./shared";

/** ProposalOS satellite (appKey: proposal). */
export async function proposalProtectedRoute(request: Request) {
  const snapshot = await enforceAppAccess(
    "proposal",
    request.headers.get("x-clerk-user-id") ?? "",
    request.headers.get("x-clerk-org-id") ?? undefined,
  );
  return Response.json({
    ok: true,
    hubUserId: snapshot.user.id,
    hubOrganizationId: snapshot.tenant.organizationId,
  });
}
