import { enforceAppAccess } from "./shared";

/** Client Portal read-model surface (appKey: client-portal). Display only — no identity SoT. */
export async function portalProtectedRoute(request: Request) {
  const snapshot = await enforceAppAccess(
    "client-portal",
    request.headers.get("x-clerk-user-id") ?? "",
    request.headers.get("x-clerk-org-id") ?? undefined,
  );
  return Response.json({
    ok: true,
    readModel: {
      organizationId: snapshot.tenant.organizationId,
      subtenantId: snapshot.tenant.subtenantId,
      entitledApps: snapshot.entitlements.filter((e) => e.status === "active").map((e) => e.appKey),
    },
  });
}
