/**
 * POST /api/webhooks/railway
 *
 * Receives Railway webhook deliveries. Verified by either an HMAC
 * signature in `X-Railway-Signature` (when Railway's project version
 * supports it) OR a `?secret=` query string equality compared to
 * RAILWAY_WEBHOOK_SECRET (the fallback for older project versions).
 *
 * Persists an IntegrationEvent and, when the payload is a deployment
 * status change, refreshes the matching DeploymentSnapshot — same
 * idempotent shape used by the periodic Railway sync.
 *
 * Returns 200 fast. Body is read raw before JSON parse so HMAC
 * verifies against the exact bytes Railway signed. Failures
 * audit-log with reason + remote IP.
 */

import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { writeAuditLog, redactMetadata } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { verifyRailwaySignature } from "@/lib/integrations/railway/webhook-verify";
import { normalizeDeploymentStatus } from "@/lib/integrations/railway/client";
import { withInboundTrafficRecording } from "@/lib/services/command-center/traffic-service";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withInboundTrafficRecording(
    request,
    { sourceLabel: "railway", endpoint: "/api/webhooks/railway" },
    () => handleRailwayWebhook(request),
  );
}

async function handleRailwayWebhook(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("x-railway-signature");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const remoteIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const rawBody = new Uint8Array(await request.arrayBuffer());

  const verify = verifyRailwaySignature(
    rawBody,
    signature,
    querySecret,
    env.RAILWAY_WEBHOOK_SECRET,
  );
  if (!verify.ok) {
    await writeAuditLog({
      eventType: "command_center.railway.webhook_rejected",
      eventCategory: "security",
      severity: "warning",
      action: `Railway webhook rejected: ${verify.reason}`,
      metadata: {
        reason: verify.reason,
        remote_ip: remoteIp,
      },
    });
    return NextResponse.json(
      { ok: false, error: verify.reason },
      { status: verify.reason === "no_secret" ? 503 : 401 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // Railway payload shape varies by event type. Common fields:
  //   type        — "DEPLOY", "ALERT", etc.
  //   status      — "SUCCESS" | "FAILED" | "CRASHED" | …
  //   deployment.id, .status, .meta
  //   project.id, .name
  //   service.id, .name
  //   environment.id, .name
  //
  // We branch on `type`; everything else we just persist as an
  // IntegrationEvent for the timeline.
  const eventType = (typeof payload.type === "string" ? payload.type : "unknown").toLowerCase();

  let appRegistryId: string | null = null;
  const serviceId = readPath(payload, ["service", "id"]);
  const environmentId = readPath(payload, ["environment", "id"]);
  if (typeof serviceId === "string" && typeof environmentId === "string") {
    const resource = await prisma.railwayResource.findUnique({
      where: { serviceId_environmentId: { serviceId, environmentId } },
      select: { appRegistryId: true },
    });
    appRegistryId = resource?.appRegistryId ?? null;
  }

  await prisma.integrationEvent.create({
    data: {
      provider: "railway",
      eventType: eventType,
      eventAction: (readPath(payload, ["status"]) as string | null) ?? null,
      resourceType: eventType,
      resourceId: (readPath(payload, ["deployment", "id"]) as string | null) ?? null,
      appRegistryId,
      severity: severityForEvent(eventType, payload),
      payloadJson: redactMetadata(payload as unknown) ?? {},
      processedAt: new Date(),
    },
  });

  // Deployment events update the matching DeploymentSnapshot in
  // place — webhook + sync both write the same shape so the row is
  // safe to upsert on either path.
  if (eventType === "deploy" && typeof serviceId === "string" && typeof environmentId === "string") {
    try {
      await persistDeploymentWebhook(payload, serviceId, environmentId, appRegistryId);
    } catch (err) {
      await writeAuditLog({
        eventType: "command_center.railway.webhook_processing_failed",
        eventCategory: "system",
        severity: "warning",
        action: `Failed to process Railway deploy webhook: ${err instanceof Error ? err.message : "unknown"}`,
        metadata: { service_id: serviceId, environment_id: environmentId },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

function readPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return null;
    }
  }
  return cur;
}

function severityForEvent(eventType: string, payload: Record<string, unknown>) {
  if (eventType === "deploy") {
    const status = (readPath(payload, ["status"]) ?? readPath(payload, ["deployment", "status"]));
    if (typeof status === "string") {
      const s = status.toLowerCase();
      if (s === "failed" || s === "crashed") return "high" as const;
    }
  }
  return "info" as const;
}

async function persistDeploymentWebhook(
  payload: Record<string, unknown>,
  serviceId: string,
  environmentId: string,
  appRegistryId: string | null,
) {
  const deploymentId = readPath(payload, ["deployment", "id"]);
  if (typeof deploymentId !== "string") return;
  const statusRaw =
    (readPath(payload, ["deployment", "status"]) as string | null) ??
    (readPath(payload, ["status"]) as string | null) ??
    "unknown";

  // Resource must exist before we can write a snapshot. Webhook
  // arriving for a brand-new (service, environment) tuple still
  // creates the resource row — periodic sync will fill in the rest
  // (project name, service name, dashboard URL).
  const resource = await prisma.railwayResource.upsert({
    where: { serviceId_environmentId: { serviceId, environmentId } },
    create: {
      appRegistryId,
      projectId: (readPath(payload, ["project", "id"]) as string | null) ?? "",
      projectName: (readPath(payload, ["project", "name"]) as string | null) ?? null,
      serviceId,
      serviceName: (readPath(payload, ["service", "name"]) as string | null) ?? null,
      environmentId,
      environmentName: (readPath(payload, ["environment", "name"]) as string | null) ?? null,
      lastSyncedAt: new Date(),
    },
    update: {
      lastSyncedAt: new Date(),
    },
  });

  const meta = (readPath(payload, ["deployment", "meta"]) as Record<string, unknown> | null) ?? {};
  const liveCommitSha =
    (readPath(meta, ["commitHash"]) as string | null) ??
    (readPath(meta, ["commitSha"]) as string | null) ??
    null;

  const status = normalizeDeploymentStatus(statusRaw);

  const upserted = await prisma.deploymentSnapshot.upsert({
    where: { railwayDeploymentId: deploymentId },
    create: {
      appRegistryId,
      railwayResourceId: resource.id,
      railwayDeploymentId: deploymentId,
      railwayStatus: status,
      railwayStatusRaw: statusRaw,
      liveCommitSha,
      liveCommitShortSha: liveCommitSha?.slice(0, 7) ?? null,
      lastSuccessfulCheckAt: status === "success" ? new Date() : null,
      checkedAt: new Date(),
      metadataJson: meta as Prisma.InputJsonValue,
    },
    update: {
      railwayStatus: status,
      railwayStatusRaw: statusRaw,
      liveCommitSha,
      liveCommitShortSha: liveCommitSha?.slice(0, 7) ?? null,
      lastSuccessfulCheckAt: status === "success" ? new Date() : undefined,
      checkedAt: new Date(),
      metadataJson: meta as Prisma.InputJsonValue,
    },
  });

  // Sprint 41: autonomous crash auto-fix. Triggers within seconds
  // of Railway sending the failed/crashed event — much faster than
  // waiting for the next reconciliation tick. The service itself
  // is no-op'd by the AUTO_FILE_CRASH_FIXES env flag + cooldown.
  if (status === "failed" || status === "crashed") {
    try {
      const { maybeAutoFileFixForSnapshot } = await import(
        "@/lib/services/command-center/crash-auto-fix-service"
      );
      await maybeAutoFileFixForSnapshot(upserted.id, "railway_webhook");
    } catch (err) {
      console.warn("[railway-webhook] auto-fix attempt failed:", err);
    }
  }
}
