import { toHubAccessSnapshot } from "./adapter/snapshot-adapter";
import { resolveHubAppAccess } from "./client";
import { HubAccessDeniedError } from "./errors";
import type { HubAccessSnapshot } from "./types/authority-snapshot";
import type { MacTechAppKey } from "./types/app-key";
import type { HubClientConfig } from "./types";

export interface ResolveAppAccessInput {
  appKey: MacTechAppKey;
  clerkUserId: string;
  clerkOrgId?: string;
  /** Service token for server-to-server; user session for BFF */
  mode: "user_session" | "service_token";
  requestId?: string;
  subtenantId?: string;
}

export interface HubAuthorityClient {
  resolveAppAccess(input: ResolveAppAccessInput): Promise<HubAccessSnapshot>;
}

export function createLiveHubAuthorityClient(config: HubClientConfig): HubAuthorityClient {
  return {
    async resolveAppAccess(input: ResolveAppAccessInput): Promise<HubAccessSnapshot> {
      try {
        const live = await resolveHubAppAccess(config, {
          clerkUserId: input.clerkUserId,
          appKey: input.appKey,
          requestedOrgId: input.clerkOrgId ?? null,
          tenantOrgId: input.subtenantId ?? null,
          requestId: input.requestId ?? null,
        });
        return toHubAccessSnapshot(live, {
          clerkOrgId: input.clerkOrgId,
          subtenantId: input.subtenantId,
        });
      } catch (error) {
        if (error instanceof HubAccessDeniedError && error.snapshot) {
          return toHubAccessSnapshot(error.snapshot, {
            clerkOrgId: input.clerkOrgId,
            subtenantId: input.subtenantId,
          });
        }
        throw error;
      }
    },
  };
}
