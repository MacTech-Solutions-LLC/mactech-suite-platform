import { createHubServiceClient, HubAccessDeniedError } from "../src/index";

const hub = createHubServiceClient({
  hubBaseUrl: process.env.MACTECH_HUB_URL ?? "https://www.suite.mactechsolutionsllc.com",
  sourceAppKey: process.env.MACTECH_SOURCE_APP_KEY ?? "governance",
  serviceToken: process.env.MACTECH_HUB_SERVICE_TOKEN,
});

type MinimalRequest = {
  headers: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  body?: unknown;
};

type MinimalResponse = {
  status(code: number): MinimalResponse;
  json(value: unknown): void;
};

export async function governanceNextRoute(request: Request) {
  const snapshot = await hub.requireHubAppAccess({
    clerkUserId: request.headers.get("x-clerk-user-id") ?? "",
    appKey: "governance",
    requestedOrgId: request.headers.get("x-mactech-org-id"),
    requestId: request.headers.get("x-request-id"),
  });
  return Response.json({ ok: true, orgId: snapshot.canonicalOrganizationId });
}

export function qmsExpressMiddleware() {
  return async (req: MinimalRequest, res: MinimalResponse, next: () => void) => {
    try {
      await hub.requireHubAppAccess({
        clerkUserId: req.headers["x-clerk-user-id"] ?? "",
        appKey: "qms",
        requestedOrgId: req.headers["x-mactech-org-id"] ?? null,
        requestId: req.headers["x-request-id"] ?? null,
      });
      next();
    } catch (error) {
      if (error instanceof HubAccessDeniedError) {
        res.status(403).json({ error: error.snapshot.decision.denyReason });
        return;
      }
      res.status(503).json({ error: "hub_unavailable" });
    }
  };
}

export async function pricingNextRoute(request: Request) {
  return hub.requireHubAppAccess({
    clerkUserId: request.headers.get("x-clerk-user-id") ?? "",
    appKey: "pricing",
    requestedOrgId: request.headers.get("x-mactech-org-id"),
  });
}

export async function proposalNextRoute(request: Request) {
  return hub.requireHubAppAccess({
    clerkUserId: request.headers.get("x-clerk-user-id") ?? "",
    appKey: "proposal",
    requestedOrgId: request.headers.get("x-mactech-org-id"),
  });
}

export async function growthCaptureRoute(request: Request) {
  return hub.requireHubAppAccess({
    clerkUserId: request.headers.get("x-clerk-user-id") ?? "",
    appKey: "growth-capture",
    requestedOrgId: request.headers.get("x-mactech-org-id"),
  });
}

/** @deprecated Use growthCaptureRoute — `capture` is a legacy alias only. */
export async function captureRoute(request: Request) {
  return growthCaptureRoute(request);
}

export async function trainingRoute(request: Request) {
  return hub.requireHubAppAccess({
    clerkUserId: request.headers.get("x-clerk-user-id") ?? "",
    appKey: "training",
    requestedOrgId: request.headers.get("x-mactech-org-id"),
  });
}

export async function mackaliInternalOnlyRoute(request: Request) {
  return hub.requireHubAppAccess({
    clerkUserId: request.headers.get("x-clerk-user-id") ?? "",
    appKey: "mackali",
    requestedOrgId: request.headers.get("x-mactech-org-id"),
  });
}

export async function cyberRangeExportRoute(request: Request) {
  return hub.requireHubAppAccess(
    {
      clerkUserId: request.headers.get("x-clerk-user-id") ?? "",
      appKey: "cyber-range",
      requestedOrgId: request.headers.get("x-mactech-org-id"),
    },
    { privileged: true },
  );
}
