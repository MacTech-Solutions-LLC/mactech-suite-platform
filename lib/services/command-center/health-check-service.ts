/**
 * Persistence + audit layer for the health probe loop. Wraps the pure
 * `probeHealth()` function with:
 *   - HealthCheckSnapshot row insert per probe
 *   - AppRegistry.lastObservedAt bump on success
 *   - audit row on first transition (up → degraded/down or back)
 */

import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { probeHealth, type HealthProbeResult } from "@/lib/integrations/health/checker";
import type { AppRegistry, HealthCheckSnapshot, HealthStatus } from "@prisma/client";

export interface ProbeAndPersistResult {
  app: AppRegistry;
  probe: HealthProbeResult;
  snapshot: HealthCheckSnapshot;
  /** True if status changed since the previous snapshot. Drives audit emission. */
  transitioned: boolean;
  previousStatus: HealthStatus | null;
}

export async function probeAndPersist(app: AppRegistry): Promise<ProbeAndPersistResult> {
  const previous = await prisma.healthCheckSnapshot.findFirst({
    where: { appRegistryId: app.id },
    orderBy: { checkedAt: "desc" },
    select: { status: true },
  });
  const previousStatus = previous?.status ?? null;

  const probe = await probeHealth(app.healthUrl);

  const snapshot = await prisma.healthCheckSnapshot.create({
    data: {
      appRegistryId: app.id,
      url: probe.url || app.healthUrl || "",
      status: probe.status,
      statusCode: probe.statusCode,
      latencyMs: probe.latencyMs,
      responseBodyHead: probe.responseBodyHead,
      errorMessage: probe.errorMessage,
    },
  });

  // Bump lastObservedAt only when we got *something* back. A probe that
  // timed out shouldn't reset the "we last saw this app at..." stamp.
  if (probe.statusCode !== null) {
    await prisma.appRegistry.update({
      where: { id: app.id },
      data: { lastObservedAt: new Date() },
    });
  }

  const transitioned = previousStatus !== null && previousStatus !== probe.status;
  if (transitioned) {
    await writeAuditLog({
      eventType: "command_center.health.transition",
      eventCategory: "system",
      severity: probe.status === "down" ? "critical" : probe.status === "degraded" ? "warning" : "info",
      action: `${app.name}: ${previousStatus} → ${probe.status}`,
      appRegistryId: app.id,
      resourceType: "health_check_snapshot",
      resourceId: snapshot.id,
      metadata: {
        app_key: app.appKey,
        health_url: probe.url,
        previous_status: previousStatus,
        new_status: probe.status,
        status_code: probe.statusCode,
        latency_ms: probe.latencyMs,
        error_message: probe.errorMessage,
      },
    });
  }

  return {
    app,
    probe,
    snapshot,
    transitioned,
    previousStatus,
  };
}
