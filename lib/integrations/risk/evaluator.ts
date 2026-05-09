/**
 * MacTech Command Center — risk evaluator.
 *
 * Pure function over (app, latest health probe). Returns the set of risk
 * categories that *should* be open for this app right now. The risk
 * service then reconciles this against existing open OperationalRiskFlag
 * rows, opening new ones and resolving stale ones.
 *
 * Slice 1 implements three of the rules from the design brief:
 *   - health_down              — probe returned 'down'
 *   - degraded                 — probe returned 'degraded'
 *   - missing_health_endpoint  — production app has no healthUrl OR the
 *                                endpoint returned 404
 *
 * Slice 2 will layer in:
 *   - production_behind_main, security_sensitive_change, failed_workflow
 *
 * Slice 3 adds:
 *   - failed_deployment, crashed_deployment, stale_deployment, missing_*
 */

import type { AppRegistry, RiskCategory, RiskSeverity } from "@prisma/client";
import type { HealthProbeResult } from "@/lib/integrations/health/checker";
import type { PageRenderProbeResult } from "@/lib/integrations/health/page-render-probe";

export interface DerivedRisk {
  category: RiskCategory;
  severity: RiskSeverity;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}

export function evaluateRisks(
  app: AppRegistry,
  probe: HealthProbeResult | null,
  pageProbe?: PageRenderProbeResult | null,
): DerivedRisk[] {
  const out: DerivedRisk[] = [];

  // Sprint 39: page-render probe → application_error flag. We emit
  // this independently of the /api/health probe — a healthy
  // /api/health combined with a 500ing homepage is exactly the
  // scenario this catches.
  if (pageProbe) {
    if (pageProbe.outcome === "5xx" || pageProbe.outcome === "application_error") {
      out.push({
        category: "application_error",
        severity: bumpForCriticality(app.criticality, "high"),
        title:
          pageProbe.outcome === "application_error"
            ? `${app.name} page renders the Next.js application-error fallback`
            : `${app.name} page returns ${pageProbe.statusCode ?? "5xx"}`,
        description:
          pageProbe.outcome === "application_error"
            ? `Anonymous GET on ${pageProbe.url} returned HTTP ${pageProbe.statusCode ?? "?"} with an SSR-error sentinel in the body${pageProbe.digest ? ` (digest ${pageProbe.digest})` : ""}. Check Railway deploy logs for the matching server-side exception.`
            : `Anonymous GET on ${pageProbe.url} returned HTTP ${pageProbe.statusCode ?? "?"}${pageProbe.digest ? ` (digest ${pageProbe.digest})` : ""}.`,
        metadata: {
          app_key: app.appKey,
          page_url: pageProbe.url,
          status_code: pageProbe.statusCode,
          digest: pageProbe.digest,
          body_head: pageProbe.bodyHead,
          latency_ms: pageProbe.latencyMs,
          outcome: pageProbe.outcome,
        },
      });
    }
  }

  // Severity scaling: missing endpoint on a low-criticality dev app is
  // info; missing on a mission-critical production app is high.
  const baseSev = bumpForCriticality(app.criticality, "medium");
  const lowSev = bumpForCriticality(app.criticality, "low");
  const highSev = bumpForCriticality(app.criticality, "high");

  // Apps in non-production lifecycles don't get risk flags for missing
  // health endpoints — they may legitimately not have one yet.
  const isProductionish =
    app.lifecycle === "production" || app.lifecycle === "staging";

  if (!probe || probe.status === "unknown") {
    if (isProductionish) {
      out.push({
        category: "missing_health_endpoint",
        severity: lowSev,
        title: `${app.name} has no health endpoint configured`,
        description:
          "Add a /api/health endpoint to this app and set healthUrl on AppRegistry. Without it the Command Center cannot detect outages.",
        metadata: {
          app_key: app.appKey,
          health_url: app.healthUrl ?? null,
          probe_reason: probe?.errorMessage ?? null,
        },
      });
    }
    return out;
  }

  if (probe.statusCode === 404) {
    out.push({
      category: "missing_health_endpoint",
      severity: lowSev,
      title: `${app.name} health endpoint returned 404`,
      description: `Configured health URL ${probe.url} returns 404. Either the endpoint hasn't shipped yet or the URL on AppRegistry is wrong.`,
      metadata: {
        app_key: app.appKey,
        health_url: probe.url,
        status_code: 404,
      },
    });
    return out;
  }

  if (probe.status === "down") {
    out.push({
      category: "health_down",
      severity: highSev,
      title: `${app.name} is DOWN`,
      description: `${probe.url} returned ${probe.statusCode ?? "no response"}${
        probe.errorMessage ? ` (${probe.errorMessage})` : ""
      }.`,
      metadata: {
        app_key: app.appKey,
        health_url: probe.url,
        status_code: probe.statusCode,
        error_message: probe.errorMessage,
        latency_ms: probe.latencyMs,
      },
    });
  } else if (probe.status === "degraded") {
    out.push({
      category: "degraded",
      severity: baseSev,
      title: `${app.name} is degraded`,
      description: `${probe.url} returned 2xx but the body indicates a dependency failure or self-reported degradation.`,
      metadata: {
        app_key: app.appKey,
        health_url: probe.url,
        status_code: probe.statusCode,
        body_head: probe.responseBodyHead?.slice(0, 256) ?? null,
        latency_ms: probe.latencyMs,
      },
    });
  }

  return out;
}

/** Map base severity through criticality so a `low`-rated probe on a
 *  mission-critical app surfaces as `high`. */
function bumpForCriticality(
  criticality: AppRegistry["criticality"],
  base: "low" | "medium" | "high",
): RiskSeverity {
  if (criticality === "mission_critical") {
    return base === "low" ? "medium" : base === "medium" ? "high" : "critical";
  }
  if (criticality === "high") {
    return base === "low" ? "low" : base === "medium" ? "medium" : "high";
  }
  if (criticality === "medium") {
    return base;
  }
  return base === "high" ? "medium" : base; // low criticality dampens highs
}
