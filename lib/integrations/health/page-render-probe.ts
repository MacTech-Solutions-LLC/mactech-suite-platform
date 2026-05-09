/**
 * Page-render probe — Sprint 39.
 *
 * Anonymous GET against an app's customer-facing page (publicUrl
 * fallback to baseUrl). Distinct from the existing healthUrl probe
 * because:
 *   - /api/health typically returns {status:'ok'} from a tiny route
 *     handler that doesn't touch the database, the Clerk middleware,
 *     or any of the SSR rendering machinery.
 *   - The pages a customer actually loads DO touch all of that — and
 *     that's where the failures show up. A missing env var or a
 *     broken Prisma query lands as Next.js's "Application error" SSR
 *     fallback page, not a 500 on /api/health.
 *
 * What we look for, in order:
 *   1. HTTP status >= 500 → outright server error.
 *   2. HTTP 200 but body contains the Next.js application-error
 *      sentinel ("Application error", "server-side exception",
 *      "Digest:") — Next renders these inline at 200 sometimes,
 *      depending on the runtime and the route's caching mode.
 *   3. HTTP 4xx other than 401/403/407/409/410/429 — a customer-facing
 *      page returning 4xx is usually a misrouted request, but 401/403
 *      are expected (route is auth-gated) so we treat those as up.
 *
 * Returns a structured result the reconciliation orchestrator turns
 * into an `application_error` risk flag (or clears one when the page
 * is healthy again).
 */

import { env } from "@/lib/env";

export type PageRenderOutcome = "up" | "5xx" | "application_error" | "4xx" | "unreachable";

export interface PageRenderProbeResult {
  url: string;
  outcome: PageRenderOutcome;
  statusCode: number | null;
  /** First 512 chars of the body when we caught an error. Helpful
   *  for the risk description so an operator can grep for it. */
  bodyHead: string | null;
  /** Next.js error digest extracted from the body when present. */
  digest: string | null;
  errorMessage: string | null;
  latencyMs: number | null;
}

/** Status codes we treat as "page is up" even if not 200. 401/403
 *  mean the route is correctly auth-gated; 405 covers GET-on-POST-only
 *  routes like /api/webhooks/*. */
const OK_NON_2XX = new Set([301, 302, 304, 307, 308, 401, 403, 405, 407, 410, 429]);

/** Sentinels Next.js renders for SSR exceptions. The `Digest:` token
 *  is the most reliable single signal — Next adds it to every error
 *  page so the digest can be looked up in build logs. */
const ERROR_SENTINELS = [
  /Application error/i,
  /server-side exception/i,
  /Digest:\s*\d+/i,
];

const TIMEOUT_MS = 12_000;

export async function probePageRender(
  url: string | null | undefined,
): Promise<PageRenderProbeResult> {
  if (!url || url.trim() === "") {
    return {
      url: "",
      outcome: "unreachable",
      statusCode: null,
      bodyHead: null,
      digest: null,
      errorMessage: "no_url_configured",
      latencyMs: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": env.HEALTH_CHECK_USER_AGENT,
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    const latencyMs = Date.now() - startedAt;
    const body = await resp.text();
    const bodyHead = body.slice(0, 512);

    if (resp.status >= 500) {
      return {
        url,
        outcome: "5xx",
        statusCode: resp.status,
        bodyHead,
        digest: extractDigest(body),
        errorMessage: `http_${resp.status}`,
        latencyMs,
      };
    }

    // 2xx body MAY still be the Next.js error page rendered inline.
    if (resp.status >= 200 && resp.status < 400) {
      const sentinel = ERROR_SENTINELS.find((re) => re.test(body));
      if (sentinel) {
        return {
          url,
          outcome: "application_error",
          statusCode: resp.status,
          bodyHead,
          digest: extractDigest(body),
          errorMessage: `application_error_sentinel_${sentinel.source}`,
          latencyMs,
        };
      }
      return {
        url,
        outcome: "up",
        statusCode: resp.status,
        bodyHead: null,
        digest: null,
        errorMessage: null,
        latencyMs,
      };
    }

    if (OK_NON_2XX.has(resp.status)) {
      return {
        url,
        outcome: "up",
        statusCode: resp.status,
        bodyHead: null,
        digest: null,
        errorMessage: null,
        latencyMs,
      };
    }

    return {
      url,
      outcome: "4xx",
      statusCode: resp.status,
      bodyHead,
      digest: extractDigest(body),
      errorMessage: `http_${resp.status}`,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      url,
      outcome: "unreachable",
      statusCode: null,
      bodyHead: null,
      digest: null,
      errorMessage: aborted ? "timeout" : err instanceof Error ? err.message : "network_error",
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractDigest(body: string): string | null {
  const m = body.match(/Digest:\s*(\d+)/i);
  return m ? m[1] : null;
}
