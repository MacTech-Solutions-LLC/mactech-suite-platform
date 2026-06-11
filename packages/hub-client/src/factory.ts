import { createLiveHubAuthorityClient } from "./hub-authority-client";
import type { HubAuthorityClient } from "./hub-authority-client";
import { createDefaultMockHubAuthority, createMockHubAuthority } from "./mock/mock-hub-authority";
import type { MockHubAuthorityOptions } from "./mock/mock-hub-authority";
import type { HubClientConfig } from "./types";

export type HubAuthorityMode = "mock" | "live";

export interface CreateHubAuthorityClientOptions {
  mode?: HubAuthorityMode;
  live?: HubClientConfig;
  mock?: MockHubAuthorityOptions;
}

const MODE_ENV = "HUB_AUTHORITY_MODE";
const SERVICE_TOKEN_ENV = "MACTECH_HUB_SERVICE_TOKEN";

function assertLiveConfig(live: HubClientConfig): void {
  if (!live.hubBaseUrl?.trim()) {
    throw new Error("createHubAuthorityClient: live mode requires live.hubBaseUrl (MACTECH_HUB_URL).");
  }
  if (!live.sourceAppKey?.trim()) {
    throw new Error("createHubAuthorityClient: live mode requires live.sourceAppKey.");
  }
  if (!live.serviceToken?.trim()) {
    throw new Error(
      `createHubAuthorityClient: live mode requires live.serviceToken (${SERVICE_TOKEN_ENV}).`,
    );
  }
}

function resolveMode(explicit?: HubAuthorityMode): HubAuthorityMode {
  if (explicit) return explicit;
  const env = process.env[MODE_ENV];
  if (env === "mock" || env === "live") return env;
  return "live";
}

/**
 * Factory for consumer-facing HubAuthorityClient.
 * Use HUB_AUTHORITY_MODE=mock|live or pass mode explicitly.
 */
export function createHubAuthorityClient(options: CreateHubAuthorityClientOptions = {}): HubAuthorityClient {
  const mode = resolveMode(options.mode);

  if (mode === "mock") {
    if (options.mock) return createMockHubAuthority(options.mock);
    return createDefaultMockHubAuthority();
  }

  if (!options.live) {
    throw new Error("createHubAuthorityClient: live mode requires options.live HubClientConfig.");
  }

  assertLiveConfig(options.live);
  return createLiveHubAuthorityClient(options.live);
}
