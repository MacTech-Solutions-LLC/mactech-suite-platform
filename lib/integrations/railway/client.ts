/**
 * Railway GraphQL client. Server-only — the API token lives in env
 * and never leaves this file. Service callers receive structured
 * outcomes shaped by `RailwayResult<T>`. Never throws on transport
 * failures; the orchestrator gates Railway ops behind
 * `railwaySyncConfigured()` and treats unconfigured as a clean no-op.
 *
 * AgentOps discipline: this is the only file in the codebase that
 * speaks to Railway. Future capability `trigger_railway_redeploy`
 * (Slice 5) will be a thin wrapper around `redeployService()` that
 * runs only behind `agents:approve` + a per-action approval. The
 * capability layer takes resource IDs in and never the API token.
 */

import { env } from "@/lib/env";

const ENDPOINT = "https://backboard.railway.app/graphql/v2";

export interface RailwayClientFailure {
  ok: false;
  reason:
    | "not_configured"
    | "unauthorized"
    | "not_found"
    | "rate_limited"
    | "transient"
    | "graphql_error";
  status: number;
  detail?: string;
}

export type RailwayResult<T> = ({ ok: true } & T) | RailwayClientFailure;

// ─── Read shapes ───────────────────────────────────────────────────────

export interface RailwayProjectSummary {
  id: string;
  name: string;
  description: string | null;
  services: RailwayServiceSummary[];
  environments: RailwayEnvironmentSummary[];
}

export interface RailwayServiceSummary {
  id: string;
  name: string;
  /** Human-readable URL for the operator to click through. */
  dashboardUrl: string;
}

export interface RailwayEnvironmentSummary {
  id: string;
  name: string;
}

export interface RailwayDeploymentSummary {
  id: string;
  status: string;            // raw status from Railway; client maps to enum
  staticUrl: string | null;  // public domain when set
  meta: Record<string, unknown> | null; // git metadata
  createdAt: string | null;
  updatedAt: string | null;
}

// ─── Client ────────────────────────────────────────────────────────────

export interface RailwayClient {
  configured: boolean;
  /** Sanity check — `me` query returns 200 + a name when the token works. */
  whoAmI(): Promise<RailwayResult<{ name: string | null }>>;
  /** Single project by id; includes services + environments inline. */
  getProject(projectId: string): Promise<RailwayResult<{ data: RailwayProjectSummary }>>;
  /** Most recent deployments for a (service, environment), newest first. */
  listDeployments(
    serviceId: string,
    environmentId: string,
    limit?: number,
  ): Promise<RailwayResult<{ data: RailwayDeploymentSummary[] }>>;
  /** Latest single deployment for a (service, environment). */
  getLatestDeployment(
    serviceId: string,
    environmentId: string,
  ): Promise<RailwayResult<{ data: RailwayDeploymentSummary | null }>>;
}

/**
 * Slice 8.1: Railway tokens come in two flavors that authenticate
 * differently against the same GraphQL endpoint:
 *   - "workspace" — Bearer header, can list/walk all projects in
 *     the workspace. Default flavor for the legacy RAILWAY_API_TOKEN.
 *   - "project"   — Project-Access-Token header, scoped to one
 *     project + environment. Used for projects that live under a
 *     different account (e.g. RAILWAY_API_TOKEN_MACTECH covers the
 *     "MacTech Solutions" project that the workspace token can't
 *     see).
 */
export type RailwayAuthStyle = "workspace" | "project";

export function getRailwayClient(): RailwayClient {
  return getRailwayClientFor({
    token: env.RAILWAY_API_TOKEN,
    authStyle: "workspace",
    label: "default",
  });
}

export interface RailwayClientArgs {
  token: string | undefined;
  authStyle: RailwayAuthStyle;
  /** Diagnostic label rendered on outbound traffic events. */
  label: string;
}

/**
 * Builds a Railway client for an arbitrary token + auth style. The
 * railway-sync-service uses this to route per-app to the right token
 * via lib/integrations/railway/token-routing.
 */
export function getRailwayClientFor(args: RailwayClientArgs): RailwayClient {
  const enabled = env.ENABLE_RAILWAY_SYNC && Boolean(args.token);
  if (!enabled) return makeUnconfiguredClient();
  return makeRealClient(args.token!, args.authStyle, args.label);
}

function makeUnconfiguredClient(): RailwayClient {
  const fail = async (): Promise<RailwayClientFailure> => ({
    ok: false,
    reason: "not_configured",
    status: 0,
  });
  return {
    configured: false,
    whoAmI: fail as RailwayClient["whoAmI"],
    getProject: fail as RailwayClient["getProject"],
    listDeployments: fail as RailwayClient["listDeployments"],
    getLatestDeployment: fail as RailwayClient["getLatestDeployment"],
  };
}

function makeRealClient(
  token: string,
  authStyle: RailwayAuthStyle = "workspace",
  // Diagnostic label rendered on outbound traffic events so multi-token
  // ops are distinguishable on /admin/ops/traffic. Default keeps slice-6.1
  // behavior identical for the legacy single-token path.
  trafficLabelSuffix: string = "default",
): RailwayClient {
  // Workspace tokens authenticate via Bearer; project tokens via the
  // Project-Access-Token header. Same endpoint, same query shape.
  const authHeaders: Record<string, string> =
    authStyle === "project"
      ? { "Project-Access-Token": token }
      : { Authorization: `Bearer ${token}` };

  async function gql<T>(
    query: string,
    variables: Record<string, unknown> = {},
    timeoutMs = 8000,
  ): Promise<RailwayResult<{ data: T }>> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const bodyJson = JSON.stringify({ query, variables });
    let statusForTraffic = 0;
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "MacTechCommandCenter/1.0",
        },
        body: bodyJson,
        signal: controller.signal,
        cache: "no-store",
      });
      statusForTraffic = resp.status;
      if (resp.status === 401) {
        return { ok: false, reason: "unauthorized", status: 401 };
      }
      if (resp.status === 403) {
        return { ok: false, reason: "rate_limited", status: 403 };
      }
      if (!resp.ok) {
        return { ok: false, reason: "transient", status: resp.status };
      }
      const body = (await resp.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (body.errors && body.errors.length > 0) {
        const detail = body.errors.map((e) => e.message).join("; ");
        // Railway returns `Not Found` errors as GraphQL errors not
        // HTTP 404, so distinguish here for a useful reason code.
        const isNotFound = detail.toLowerCase().includes("not found");
        return {
          ok: false,
          reason: isNotFound ? "not_found" : "graphql_error",
          status: isNotFound ? 404 : 200,
          detail,
        };
      }
      if (!body.data) {
        return { ok: false, reason: "graphql_error", status: 200, detail: "empty_data" };
      }
      return { ok: true, data: body.data };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return { ok: false, reason: "transient", status: 0, detail: aborted ? "timeout" : undefined };
    } finally {
      clearTimeout(t);
      try {
        const { recordOutboundCall } = await import(
          "@/lib/services/command-center/traffic-service"
        );
        // First word of the GraphQL query (e.g. "query Foo {…}" or
        // "mutation Bar {…}") is descriptive enough to attribute by;
        // we don't store the variables — they often contain ids.
        const opName =
          query.trim().match(/^(query|mutation)\s+(\w+)/i)?.[2] ??
          query.trim().match(/^(query|mutation)/i)?.[1] ??
          "graphql";
        void recordOutboundCall({
          targetLabel: "railway",
          endpoint: `railway:graphql:${opName}:${trafficLabelSuffix}`,
          method: "POST",
          statusCode: statusForTraffic || 0,
          bytesOut: bodyJson.length,
          durationMs: Date.now() - startedAt,
        });
      } catch {
        /* observability never blocks */
      }
    }
  }

  return {
    configured: true,

    async whoAmI() {
      const r = await gql<{ me: { name: string | null } }>(`query { me { name } }`);
      if (!r.ok) return r;
      return { ok: true, name: r.data.me?.name ?? null };
    },

    async getProject(projectId) {
      const r = await gql<{
        project: {
          id: string;
          name: string;
          description: string | null;
          services: { edges: Array<{ node: { id: string; name: string } }> };
          environments: { edges: Array<{ node: { id: string; name: string } }> };
        };
      }>(
        `query($projectId: String!) {
          project(id: $projectId) {
            id
            name
            description
            services { edges { node { id name } } }
            environments { edges { node { id name } } }
          }
        }`,
        { projectId },
      );
      if (!r.ok) return r;
      const p = r.data.project;
      return {
        ok: true,
        data: {
          id: p.id,
          name: p.name,
          description: p.description,
          services: (p.services?.edges ?? []).map((e) => ({
            id: e.node.id,
            name: e.node.name,
            dashboardUrl: `https://railway.app/project/${p.id}/service/${e.node.id}`,
          })),
          environments: (p.environments?.edges ?? []).map((e) => ({
            id: e.node.id,
            name: e.node.name,
          })),
        },
      };
    },

    async listDeployments(serviceId, environmentId, limit = 20) {
      const r = await gql<{
        deployments: {
          edges: Array<{
            node: {
              id: string;
              status: string;
              staticUrl: string | null;
              meta: Record<string, unknown> | null;
              createdAt: string | null;
              updatedAt: string | null;
            };
          }>;
        };
      }>(
        `query($serviceId: String!, $environmentId: String!, $first: Int!) {
          deployments(
            first: $first,
            input: { serviceId: $serviceId, environmentId: $environmentId }
          ) {
            edges {
              node {
                id
                status
                staticUrl
                meta
                createdAt
                updatedAt
              }
            }
          }
        }`,
        { serviceId, environmentId, first: limit },
      );
      if (!r.ok) return r;
      return {
        ok: true,
        data: (r.data.deployments?.edges ?? []).map((e) => ({
          id: e.node.id,
          status: e.node.status,
          staticUrl: e.node.staticUrl,
          meta: e.node.meta,
          createdAt: e.node.createdAt,
          updatedAt: e.node.updatedAt,
        })),
      };
    },

    async getLatestDeployment(serviceId, environmentId) {
      const list = await this.listDeployments(serviceId, environmentId, 1);
      if (!list.ok) return list;
      return { ok: true, data: list.data[0] ?? null };
    },
  };
}

/**
 * Map Railway's raw status string to our DeploymentStatus enum. Railway
 * occasionally adds new states; everything we don't recognize lands in
 * `unknown` so a Railway API change can't break the Suite.
 *
 * Strings observed in the wild (lowercased): `QUEUED`, `BUILDING`,
 * `DEPLOYING`, `INITIALIZING`, `SUCCESS`, `FAILED`, `CRASHED`,
 * `REMOVED`, `REMOVING`, `RESTARTING`, `SLEEPING`, `SKIPPED`,
 * `WAITING`, `NEEDS_APPROVAL`.
 */
export function normalizeDeploymentStatus(
  raw: string,
): import("@prisma/client").DeploymentStatus {
  const s = (raw || "").toLowerCase();
  switch (s) {
    case "queued":
    case "waiting":
    case "needs_approval":
      return "queued";
    case "initializing":
      return "initializing";
    case "building":
      return "building";
    case "deploying":
      return "deploying";
    case "success":
    case "succeeded":
    case "healthy":
      return "success";
    case "failed":
      return "failed";
    case "crashed":
      return "crashed";
    case "removed":
    case "removing":
      return "removed";
    case "restarting":
      return "restarting";
    case "sleeping":
      return "sleeping";
    case "skipped":
      return "skipped";
    default:
      return "unknown";
  }
}
