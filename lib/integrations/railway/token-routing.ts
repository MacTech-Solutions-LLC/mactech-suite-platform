/**
 * Per-app Railway token routing — Slice 8.1.
 *
 * Code-defined map from AppRegistry.appKey to which Railway token +
 * auth style Suite should use to query that app's deployment data.
 * Code-defined intentionally (vs DB-backed) so an unauthorized DB
 * write cannot redirect a sync to the wrong workspace's data — same
 * principle as the AgentOps capability registry (slice 5).
 *
 * When a project token is used (auth style "project"), the token is
 * already scoped to a single project + environment server-side, so
 * the sync service doesn't need to know the project id either; the
 * client.getProject() call resolves whatever project the token sees.
 *
 * Default for everything not in the map: the legacy
 * RAILWAY_API_TOKEN with workspace auth.
 */

import { env } from "@/lib/env";
import {
  getRailwayClient,
  getRailwayClientFor,
  type RailwayAuthStyle,
  type RailwayClient,
} from "./client";

interface TokenBinding {
  /** Env var name carrying the token. Diagnostic — not the value. */
  envVarName: string;
  /** Token value (resolved from env). */
  token: string | undefined;
  authStyle: RailwayAuthStyle;
  /** Diagnostic label rendered on outbound traffic events. */
  label: string;
  /** When set, the routing rule is project-scoped — the token only
   *  sees this project. The sync service uses this to skip the
   *  project-id discovery step. */
  scopedProjectId?: string;
}

/**
 * Per-app overrides. Anything not listed here falls through to the
 * default (RAILWAY_API_TOKEN, workspace auth). Add new rows here when
 * an app's Railway project lives outside the default workspace.
 */
const APP_TOKEN_OVERRIDES: Record<string, Omit<TokenBinding, "token">> = {
  // mactech-core lives in the standalone "MacTech Solutions" project
  // (project id 72740679-75b1-4b1d-b0ec-0fbee4b7a710) which the
  // workspace token can't see. Project token scopes auth to this
  // project + the production environment.
  "mactech-core": {
    envVarName: "RAILWAY_API_TOKEN_MACTECH",
    authStyle: "project",
    label: "mactech-project",
    scopedProjectId: "72740679-75b1-4b1d-b0ec-0fbee4b7a710",
  },
  // codex (WELCOMETOTHETRIBE/CMMC) lives in the "CMMC Codex" project
  // on a Railway workspace the default token can't see. Same project-
  // token pattern as mactech-core.
  codex: {
    envVarName: "RAILWAY_API_TOKEN_CODEX",
    authStyle: "project",
    label: "codex-project",
    scopedProjectId: "a03f2ff2-9b15-492c-a162-ab94c3124f74",
  },
};

/**
 * Resolve the right Railway client for a given app. Always returns
 * a RailwayClient — when the bound env var is unset, the client
 * itself reports `configured: false` so the caller's no-op path is
 * unchanged.
 */
export function getRailwayClientForApp(appKey: string): {
  client: RailwayClient;
  binding: TokenBinding | null;
} {
  const override = APP_TOKEN_OVERRIDES[appKey];
  if (!override) {
    return { client: getRailwayClient(), binding: null };
  }
  const token = resolveTokenFromEnv(override.envVarName);
  const binding: TokenBinding = { ...override, token };
  const client = getRailwayClientFor({
    token: binding.token,
    authStyle: binding.authStyle,
    label: binding.label,
  });
  return { client, binding };
}

/**
 * For diagnostic / admin-page rendering: which apps have non-default
 * token bindings, and whether the env var is currently set.
 */
export function listTokenOverrides(): Array<{
  appKey: string;
  envVarName: string;
  authStyle: RailwayAuthStyle;
  label: string;
  scopedProjectId: string | null;
  envVarSet: boolean;
}> {
  return Object.entries(APP_TOKEN_OVERRIDES).map(([appKey, b]) => ({
    appKey,
    envVarName: b.envVarName,
    authStyle: b.authStyle,
    label: b.label,
    scopedProjectId: b.scopedProjectId ?? null,
    envVarSet: Boolean(resolveTokenFromEnv(b.envVarName)),
  }));
}

function resolveTokenFromEnv(envVarName: string): string | undefined {
  // Whitelisted to the env keys we actually accept — no arbitrary
  // env-var lookup. Keeps the routing surface narrow.
  switch (envVarName) {
    case "RAILWAY_API_TOKEN_MACTECH":
      return env.RAILWAY_API_TOKEN_MACTECH;
    case "RAILWAY_API_TOKEN_BMAC":
      return env.RAILWAY_API_TOKEN_BMAC;
    case "RAILWAY_API_TOKEN_CODEX":
      return env.RAILWAY_API_TOKEN_CODEX;
    default:
      return undefined;
  }
}
