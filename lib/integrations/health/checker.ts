/**
 * MacTech Command Center — health probe.
 *
 * Hits an app's /api/health (or /api/build-info) endpoint and classifies
 * the response. Intentionally defensive: any single app being slow,
 * broken, or having no endpoint at all must NEVER take down the
 * reconciliation worker.
 *
 * Status classification (HealthStatus):
 *   up        — 2xx, body parses as JSON, status:"ok" (or no status field)
 *   degraded  — 2xx but body says status:"degraded" / dependency:"failed"
 *   down      — non-2xx OR network/timeout error
 *   unknown   — endpoint not configured / can't be reached at all
 *
 * Build-info parsing is best-effort: if /api/build-info returns JSON
 * with a `commitSha`, we surface it for the production-drift evaluator
 * (slice 2). Slice 1 only persists status + latency.
 */

import { env } from "@/lib/env";

export interface HealthProbeResult {
  url: string;
  status: "up" | "degraded" | "down" | "unknown";
  statusCode: number | null;
  latencyMs: number | null;
  responseBodyHead: string | null;
  errorMessage: string | null;
  /** Parsed when the body is JSON. Used by drift detection in slice 2. */
  parsed: ProbeBody | null;
}

export interface ProbeBody {
  status?: string;
  service?: string;
  database?: string;
  commitSha?: string;
  branch?: string;
  repo?: string;
  environment?: string;
  timestamp?: string;
  [k: string]: unknown;
}

const MAX_BODY_HEAD = 512;

export async function probeHealth(url: string | null | undefined): Promise<HealthProbeResult> {
  if (!url || url.trim() === "") {
    return {
      url: "",
      status: "unknown",
      statusCode: null,
      latencyMs: null,
      responseBodyHead: null,
      errorMessage: "no_health_url_configured",
      parsed: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.HEALTH_CHECK_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": env.HEALTH_CHECK_USER_AGENT,
      },
      signal: controller.signal,
      // Health endpoints should never read auth headers; explicit no-cache
      // so a stale CDN doesn't lie to us.
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    const text = await resp.text();
    const bodyHead = text.slice(0, MAX_BODY_HEAD);
    const parsed = tryParseJson(text);

    if (!resp.ok) {
      return {
        url,
        status: "down",
        statusCode: resp.status,
        latencyMs,
        responseBodyHead: bodyHead || null,
        errorMessage: `http_${resp.status}`,
        parsed,
      };
    }

    const status = classifyHealthBody(parsed);
    return {
      url,
      status,
      statusCode: resp.status,
      latencyMs,
      responseBodyHead: bodyHead || null,
      errorMessage: null,
      parsed,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      url,
      status: "down",
      statusCode: null,
      latencyMs,
      responseBodyHead: null,
      errorMessage: aborted ? "timeout" : err instanceof Error ? err.message : "network_error",
      parsed: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function tryParseJson(text: string): ProbeBody | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as ProbeBody;
  } catch {
    /* not JSON — that's fine, plenty of health endpoints return plain "ok" */
  }
  return null;
}

function classifyHealthBody(parsed: ProbeBody | null): "up" | "degraded" {
  if (!parsed) return "up"; // 2xx with non-JSON body = treat as up
  const s = (parsed.status ?? "ok").toLowerCase();
  if (s === "degraded" || s === "warning" || s === "warn") return "degraded";
  // Some apps signal degradation via dependency status fields rather than a
  // top-level status. Most common: { database: "ok" | "degraded" | "down" }.
  for (const [k, v] of Object.entries(parsed)) {
    if (k === "status" || k === "service" || k === "timestamp") continue;
    if (typeof v === "string") {
      const lv = v.toLowerCase();
      if (lv === "down" || lv === "fail" || lv === "failed" || lv === "error") return "degraded";
    }
  }
  return "up";
}
