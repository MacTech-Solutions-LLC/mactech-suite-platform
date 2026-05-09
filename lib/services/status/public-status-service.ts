/**
 * Public status page service — Slice 11.
 *
 * Renders /status (and the status.suite.mactechsolutionsllc.com
 * subdomain) without exposing anything internal. The service deliberately
 * returns a narrow projection: display name, sanitized health rollup,
 * last-checked timestamp. NO appKey, NO repoFullName, NO commit SHAs,
 * NO risk descriptions, NO traffic edges.
 *
 * Apps are opt-in: only AppRegistry rows with publicStatusVisible=true
 * appear. Default is false; admin must flip the toggle before anything
 * leaks. Helps when an internal-only app shouldn't be advertised to
 * customers, or when an experimental app shouldn't be on the marketing
 * surface.
 */

import { prisma } from "@/lib/db/prisma";

export type PublicStatus = "operational" | "degraded" | "down" | "unknown";

export interface PublicAppStatus {
  /** Display name (publicStatusName override, or AppRegistry.name). */
  name: string;
  /** Sanitized health rollup. Internal HealthStatus enum is mapped
   *  through {@link PUBLIC_STATUS_MAP} so we never accidentally expose
   *  a new internal value to the public surface. */
  status: PublicStatus;
  /** Last time we successfully checked. May be null if a newly-opted-in
   *  app has never been probed. Public copy treats null as "unknown". */
  lastCheckedAt: Date | null;
  /** Public URL the customer hits, when configured. Used to render a
   *  link from each row. */
  publicUrl: string | null;
}

export interface PublicStatusPayload {
  /** Roll-up across every visible app. "down" wins over "degraded"
   *  wins over "unknown" wins over "operational". An empty visible-set
   *  reads as "operational" rather than "unknown" — saying "no data"
   *  on a public status page reads worse than saying "all systems go". */
  overall: PublicStatus;
  apps: PublicAppStatus[];
  /** When this payload was computed. The public page renders this as
   *  "checked X minutes ago" so visitors know it's fresh. */
  generatedAt: Date;
}

const PUBLIC_STATUS_MAP: Record<string, PublicStatus> = {
  up: "operational",
  degraded: "degraded",
  down: "down",
  unknown: "unknown",
};

/** Returns the public-page payload. Always safe to expose to anonymous
 *  visitors — the projection is hand-picked and never includes raw
 *  AppRegistry rows or HealthCheckSnapshot bodies. */
export async function getPublicStatus(): Promise<PublicStatusPayload> {
  const apps = await prisma.appRegistry.findMany({
    where: {
      publicStatusVisible: true,
      status: "active",
    },
    orderBy: [{ criticality: "desc" }, { name: "asc" }],
    include: {
      healthSnapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { status: true, checkedAt: true },
      },
    },
  });

  const projected: PublicAppStatus[] = apps.map((a) => {
    const snap = a.healthSnapshots[0];
    return {
      name: a.publicStatusName?.trim() || a.name,
      status: snap ? (PUBLIC_STATUS_MAP[snap.status] ?? "unknown") : "unknown",
      lastCheckedAt: snap?.checkedAt ?? null,
      publicUrl: a.publicUrl ?? null,
    };
  });

  return {
    overall: rollupOverall(projected),
    apps: projected,
    generatedAt: new Date(),
  };
}

function rollupOverall(apps: PublicAppStatus[]): PublicStatus {
  if (apps.length === 0) return "operational";
  if (apps.some((a) => a.status === "down")) return "down";
  if (apps.some((a) => a.status === "degraded")) return "degraded";
  if (apps.every((a) => a.status === "unknown")) return "unknown";
  return "operational";
}
