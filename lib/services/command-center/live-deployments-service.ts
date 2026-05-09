/**
 * Live Railway deploy activity — Sprint 34.
 *
 * Categorizes the latest DeploymentSnapshot per active RailwayResource
 * into three live buckets the operator wants on a single glance:
 *
 *   1. inFlight        — currently building/deploying/queued/restarting.
 *                         Render with a pulse so the row "feels" alive.
 *   2. recentlyFailed  — latest snapshot is failed or crashed AND the
 *                         snapshot is from the last 24h. Older permanent
 *                         failures fall off so the "currently broken"
 *                         section doesn't accumulate.
 *   3. recentlyShipped — latest snapshot is success AND the snapshot
 *                         is from the last 1h. Reads like a
 *                         "release radio".
 *
 * Real-time-ness comes from the existing Railway webhook handler at
 * /api/webhooks/railway: each deploy event upserts a DeploymentSnapshot.
 * The page polls this service every ~10s; the data freshness is
 * bounded by webhook delivery latency, which is sub-second in practice.
 */

import { prisma } from "@/lib/db/prisma";
import type { DeploymentStatus } from "@prisma/client";

const IN_FLIGHT_STATUSES: DeploymentStatus[] = [
  "queued",
  "initializing",
  "building",
  "deploying",
  "restarting",
];

const FAILED_STATUSES: DeploymentStatus[] = ["failed", "crashed"];

export interface LiveDeployRow {
  /** DeploymentSnapshot id — stable across re-renders. */
  id: string;
  /** Latest railway status enum + raw fallback for unmapped values. */
  status: DeploymentStatus;
  statusRaw: string | null;
  /** When the snapshot landed in our DB (≈ when the webhook fired or
   *  when reconciliation last ran). Drives the time-ago display. */
  checkedAt: Date;
  /** Most-recent successful timestamp for the same resource. Only
   *  populated for `recentlyFailed` rows so we can show "last green
   *  X hours ago" alongside the failure. */
  lastSuccessAt: Date | null;
  /** App + service info for display. */
  appKey: string | null;
  appName: string | null;
  serviceName: string | null;
  projectName: string | null;
  environmentName: string | null;
  /** What's actually deploying (or just deployed). */
  liveCommitShortSha: string | null;
  liveBranch: string | null;
  /** Direct Railway dashboard URL when available, so the operator can
   *  jump into Railway's logs in one click. */
  railwayDashboardUrl: string | null;
  /** Surface the snapshot's error message for failed/crashed rows. */
  errorMessage: string | null;
  /** AppRegistry.repoFullName — used by the per-row "Plan agent run
   *  to fix" deep-link on crashed cards. */
  repoFullName: string | null;
}

export interface LiveDeployActivity {
  inFlight: LiveDeployRow[];
  recentlyFailed: LiveDeployRow[];
  recentlyShipped: LiveDeployRow[];
  /** Server timestamp the rollup was computed at — the page header
   *  shows this so the operator can verify the auto-refresh is
   *  actually firing. */
  generatedAt: Date;
}

const FAILED_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const SHIPPED_LOOKBACK_MS = 60 * 60 * 1000;

export async function getLiveDeploymentActivity(): Promise<LiveDeployActivity> {
  const now = Date.now();
  const failedSince = new Date(now - FAILED_LOOKBACK_MS);
  const shippedSince = new Date(now - SHIPPED_LOOKBACK_MS);

  // Pull the latest snapshot per active resource. We do this in one
  // query then group in JS — Prisma doesn't have a clean "first per
  // partition" without raw SQL, and the active-resource set is
  // bounded (single-digit-to-low-tens in practice).
  const resources = await prisma.railwayResource.findMany({
    where: { active: true },
    select: {
      id: true,
      serviceName: true,
      projectName: true,
      environmentName: true,
      railwayDashboardUrl: true,
      app: { select: { appKey: true, name: true, repoFullName: true } },
      deploymentSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: {
          id: true,
          railwayStatus: true,
          railwayStatusRaw: true,
          checkedAt: true,
          liveCommitShortSha: true,
          liveBranch: true,
          metadataJson: true,
        },
      },
    },
  });

  // For the recentlyFailed section, look up the most recent success
  // per resource so we can show "last green X hours ago" inline.
  const lastSuccessByResource = new Map<string, Date>(
    (
      await prisma.deploymentSnapshot.groupBy({
        by: ["railwayResourceId"],
        where: { railwayStatus: "success" },
        _max: { checkedAt: true },
      })
    )
      .filter((r) => r._max.checkedAt)
      .map((r) => [r.railwayResourceId, r._max.checkedAt!]),
  );

  const inFlight: LiveDeployRow[] = [];
  const recentlyFailed: LiveDeployRow[] = [];
  const recentlyShipped: LiveDeployRow[] = [];

  for (const r of resources) {
    const snap = r.deploymentSnapshots[0];
    if (!snap) continue;

    const errMsg = extractErrorMessage(snap.metadataJson);
    const base: LiveDeployRow = {
      id: snap.id,
      status: snap.railwayStatus,
      statusRaw: snap.railwayStatusRaw,
      checkedAt: snap.checkedAt,
      lastSuccessAt: lastSuccessByResource.get(r.id) ?? null,
      appKey: r.app?.appKey ?? null,
      appName: r.app?.name ?? null,
      serviceName: r.serviceName,
      projectName: r.projectName,
      environmentName: r.environmentName,
      liveCommitShortSha: snap.liveCommitShortSha,
      liveBranch: snap.liveBranch,
      railwayDashboardUrl: r.railwayDashboardUrl,
      errorMessage: errMsg,
      repoFullName: r.app?.repoFullName ?? null,
    };

    if (IN_FLIGHT_STATUSES.includes(snap.railwayStatus)) {
      inFlight.push(base);
    } else if (
      FAILED_STATUSES.includes(snap.railwayStatus) &&
      snap.checkedAt >= failedSince
    ) {
      recentlyFailed.push(base);
    } else if (
      snap.railwayStatus === "success" &&
      snap.checkedAt >= shippedSince
    ) {
      recentlyShipped.push(base);
    }
  }

  // Sort each bucket by recency descending so newest activity floats up.
  const sortByCheckedAt = (a: LiveDeployRow, b: LiveDeployRow) =>
    b.checkedAt.getTime() - a.checkedAt.getTime();
  inFlight.sort(sortByCheckedAt);
  recentlyFailed.sort(sortByCheckedAt);
  recentlyShipped.sort(sortByCheckedAt);

  return {
    inFlight,
    recentlyFailed,
    recentlyShipped,
    generatedAt: new Date(),
  };
}

/** Defensive parse: Railway's metadataJson is freeform; we surface
 *  whatever string field most plausibly explains the failure. */
function extractErrorMessage(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ["errorMessage", "error", "message", "lastError"]) {
    const v = m[key];
    if (typeof v === "string" && v.length > 0) return v.slice(0, 280);
  }
  return null;
}
