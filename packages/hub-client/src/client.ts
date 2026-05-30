import {
  HubAccessDeniedError,
  HubContractValidationError,
  HubServiceAuthError,
  HubUnavailableError,
} from "./errors";
import { assertSnapshotShape, verifyAuthoritySnapshot } from "./snapshot";
import type {
  HubAuditEventInput,
  HubAuditEventResult,
  HubAuthorityRequest,
  HubAuthoritySnapshot,
  HubClientConfig,
  RequireHubAccessOptions,
  SuiteObjectReferenceInput,
} from "./types";

type CacheEntry = {
  snapshot: HubAuthoritySnapshot;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();
const UNSAFE_DEV_OVERRIDE_ENV = "MACTECH_HUB_CLIENT_UNSAFE_ALLOW_LOCAL_AUTHORITY_OVERRIDE";

export function createHubServiceClient(config: HubClientConfig) {
  const normalized = normalizeConfig(config);

  return {
    resolveHubAppAccess: (request: Omit<HubAuthorityRequest, "service">) =>
      resolveHubAppAccess(normalized, request),
    requireHubAppAccess: (
      request: Omit<HubAuthorityRequest, "service">,
      options?: RequireHubAccessOptions,
    ) => requireHubAppAccess(normalized, request, options),
    emitHubAuditEvent: (event: HubAuditEventInput) => emitHubAuditEvent(normalized, event),
    resolveSuiteObjectRef: (ref: SuiteObjectReferenceInput) => resolveSuiteObjectRef(normalized, ref),
    verifyAuthoritySnapshot,
  };
}

export async function resolveHubAppAccess(
  config: HubClientConfig,
  request: Omit<HubAuthorityRequest, "service">,
): Promise<HubAuthoritySnapshot> {
  const normalized = normalizeConfig(config);
  const unsafe = unsafeOverrideSnapshot(normalized);
  if (unsafe) return unsafe;

  const cacheKey = buildCacheKey(normalized.sourceAppKey, request);
  const cached = cache.get(cacheKey)?.snapshot;
  if (cached && new Date(cached.cache.expiresAt) > new Date()) {
    return verifyAuthoritySnapshot(cached);
  }

  const response = await hubFetch(normalized, "/api/hub/authority/resolve-app-access", {
    method: "POST",
    body: JSON.stringify({
      ...request,
      requestId: request.requestId ?? normalized.requestId ?? null,
      service: {
        sourceAppKey: normalized.sourceAppKey,
        authMethod: "service_token",
      },
    }),
  });

  const payload = await safeJson(response);
  if (response.status === 401 || response.status === 403) {
    if (payload?.snapshot) {
      assertSnapshotShape(payload.snapshot);
      throw new HubAccessDeniedError("Hub denied app access.", payload.snapshot);
    }
    throw new HubServiceAuthError(payload?.detail ?? payload?.error ?? "Hub service authentication failed.", response.status);
  }
  if (!response.ok) {
    throw new HubUnavailableError(`Hub authority request failed with ${response.status}.`, response.status);
  }

  assertSnapshotShape(payload?.snapshot);
  const snapshot = verifyAuthoritySnapshot(payload.snapshot);
  cache.set(cacheKey, { snapshot, cachedAt: Date.now() });
  return snapshot;
}

export async function requireHubAppAccess(
  config: HubClientConfig,
  request: Omit<HubAuthorityRequest, "service">,
  options: RequireHubAccessOptions = {},
): Promise<HubAuthoritySnapshot> {
  try {
    const snapshot = await resolveHubAppAccess(config, request);
    return verifyAuthoritySnapshot(snapshot, {
      allowStaleForReadOnly: options.allowStaleCacheForReadOnly,
      privileged: options.privileged ?? true,
    });
  } catch (error) {
    if (error instanceof HubAccessDeniedError) throw error;
    throw error;
  }
}

export async function emitHubAuditEvent(
  config: HubClientConfig,
  event: HubAuditEventInput,
): Promise<HubAuditEventResult> {
  const normalized = normalizeConfig(config);
  const response = await hubFetch(normalized, "/api/hub/audit/events", {
    method: "POST",
    body: JSON.stringify({
      ...event,
      sourceAppKey: event.sourceAppKey ?? event.appKey ?? normalized.sourceAppKey,
      appKey: event.appKey ?? event.sourceAppKey ?? normalized.sourceAppKey,
      requestId: event.requestId ?? normalized.requestId ?? null,
    }),
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    throw new HubUnavailableError(payload?.detail ?? payload?.error ?? "Hub audit emission failed.", response.status);
  }
  if (
    !payload?.ok ||
    typeof payload.id !== "string" ||
    typeof payload.sequenceNumber !== "number" ||
    typeof payload.currentHash !== "string"
  ) {
    throw new HubContractValidationError("Hub audit endpoint returned a malformed payload.");
  }
  return {
    ok: true,
    id: payload.id,
    sequenceNumber: payload.sequenceNumber,
    currentHash: payload.currentHash,
  };
}

export async function resolveSuiteObjectRef(
  config: HubClientConfig,
  ref: SuiteObjectReferenceInput,
): Promise<Record<string, unknown>> {
  const normalized = normalizeConfig(config);
  const response = await hubFetch(normalized, "/api/hub/objects/resolve", {
    method: "POST",
    body: JSON.stringify({ ...ref, sourceAppKey: ref.sourceAppKey ?? normalized.sourceAppKey }),
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    throw new HubUnavailableError(payload?.detail ?? payload?.error ?? "Hub object reference resolution failed.", response.status);
  }
  if (!payload || typeof payload !== "object") {
    throw new HubContractValidationError("Hub object reference payload is malformed.");
  }
  return payload as Record<string, unknown>;
}

async function hubFetch(config: HubClientConfig, path: string, init: RequestInit) {
  if (!config.serviceToken) {
    throw new HubServiceAuthError("Hub service token is required unless unsafe local override is explicitly enabled.");
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  return fetchImpl(new URL(path, config.hubBaseUrl).toString(), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-mactech-service-token": config.serviceToken,
      "x-mactech-audit-key": config.serviceToken,
      "x-mactech-source-app": config.sourceAppKey,
      ...(config.requestId ? { "x-request-id": config.requestId } : {}),
      ...(init.headers ?? {}),
    },
  });
}

function normalizeConfig(config: HubClientConfig): HubClientConfig {
  if (!config.hubBaseUrl) throw new HubContractValidationError("hubBaseUrl is required.");
  if (!config.sourceAppKey) throw new HubContractValidationError("sourceAppKey is required.");
  return {
    ...config,
    hubBaseUrl: config.hubBaseUrl.endsWith("/") ? config.hubBaseUrl : `${config.hubBaseUrl}/`,
  };
}

function unsafeOverrideSnapshot(config: HubClientConfig): HubAuthoritySnapshot | null {
  const override = config.unsafeDevOverride;
  const envVarName = override?.envVarName ?? UNSAFE_DEV_OVERRIDE_ENV;
  if (!override?.enabled) return null;
  if (process.env[envVarName] !== "true") return null;
  if (!override.snapshot) {
    throw new HubContractValidationError("Unsafe dev override enabled without a snapshot.");
  }
  return verifyAuthoritySnapshot(override.snapshot, { allowStaleForReadOnly: true, privileged: false });
}

function buildCacheKey(sourceAppKey: string, request: Omit<HubAuthorityRequest, "service">): string {
  return [
    sourceAppKey,
    request.clerkUserId,
    request.appKey,
    request.requestedOrgId ?? "",
    request.tenantOrgId ?? "",
  ].join("|");
}

async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
