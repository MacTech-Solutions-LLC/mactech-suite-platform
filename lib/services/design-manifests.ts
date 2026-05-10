/**
 * Sprint 53 — Design manifest service.
 *
 * Reads every onboarded MacTech app's `mactech-manifest.json` and
 * returns the parsed payloads to the Design Surface in /admin/design.
 *
 * Discovery rule: each AppRegistry row exposes a manifest at
 * `<publicUrl>/_/mactech-manifest.json` (per ONBOARDING.md). Apps
 * that haven't been onboarded just return null and render in their
 * "not yet" state.
 *
 * 5-minute in-memory cache so the Design Surface render doesn't
 * hammer every app's `/_/manifest` endpoint on every page view. Per
 * the v0.5 brief, this is server-only — no client component pulls
 * directly.
 */

import "server-only";
import {
  ManifestSchema,
  type Manifest,
} from "@mactech-solutions-llc/onboard";
import { prisma } from "@/lib/db/prisma";

interface CachedEntry {
  manifest: Manifest | null;
  fetched_at: number;
  /** Last fetch error, if any. Surfaced in the UI as "invalid manifest"
   *  rather than re-thrown — the Design Surface degrades gracefully. */
  error: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CachedEntry>();

export interface AppManifestRow {
  appKey: string;
  appName: string;
  publicUrl: string | null;
  criticality: string;
  status: string;
  manifest: Manifest | null;
  /** "ok" | "stale" (HTTP failure) | "invalid" (parse failure) |
   *  "not-onboarded" (404). */
  state: "ok" | "stale" | "invalid" | "not-onboarded";
  fetchedAt: number | null;
}

function manifestUrlFor(publicUrl: string): string {
  // Trim trailing slash to avoid double-slashes.
  const base = publicUrl.replace(/\/$/, "");
  return `${base}/_/mactech-manifest.json`;
}

export async function fetchManifestForApp(
  appKey: string,
): Promise<AppManifestRow | null> {
  const app = await prisma.appRegistry.findUnique({
    where: { appKey },
  });
  if (!app) return null;

  const row: AppManifestRow = {
    appKey: app.appKey,
    appName: app.name,
    publicUrl: app.publicUrl ?? null,
    criticality: app.criticality,
    status: app.status,
    manifest: null,
    state: "not-onboarded",
    fetchedAt: null,
  };

  if (!app.publicUrl) {
    return row;
  }

  const cached = cache.get(app.appKey);
  if (cached && Date.now() - cached.fetched_at < CACHE_TTL_MS) {
    return {
      ...row,
      manifest: cached.manifest,
      state: cached.manifest
        ? "ok"
        : cached.error?.startsWith("HTTP 404")
          ? "not-onboarded"
          : cached.error?.startsWith("parse")
            ? "invalid"
            : "stale",
      fetchedAt: cached.fetched_at,
    };
  }

  let manifest: Manifest | null = null;
  let error: string | null = null;
  try {
    const url = manifestUrlFor(app.publicUrl);
    const res = await fetch(url, {
      // Defensive timeout via AbortController — registry apps that
      // are down shouldn't block the Design Surface for 30s.
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 300 },
    });
    if (res.status === 404) {
      error = "HTTP 404 (not onboarded)";
    } else if (!res.ok) {
      error = `HTTP ${res.status}`;
    } else {
      const json: unknown = await res.json();
      const parsed = ManifestSchema.safeParse(json);
      if (parsed.success) {
        manifest = parsed.data;
      } else {
        error = `parse: ${parsed.error.issues[0]?.message ?? "invalid schema"}`;
      }
    }
  } catch (e) {
    error = `network: ${(e as Error).message}`;
  }

  cache.set(app.appKey, {
    manifest,
    error,
    fetched_at: Date.now(),
  });

  return {
    ...row,
    manifest,
    state: manifest
      ? "ok"
      : error?.startsWith("HTTP 404")
        ? "not-onboarded"
        : error?.startsWith("parse")
          ? "invalid"
          : "stale",
    fetchedAt: Date.now(),
  };
}

export async function fetchAllManifests(): Promise<AppManifestRow[]> {
  const apps = await prisma.appRegistry.findMany({
    orderBy: { criticality: "desc" },
  });
  // Parallel fetch. Manifest service caches per-app so concurrent
  // /admin/design page loads don't all hit the same URLs.
  return Promise.all(
    apps.map(async (app) => {
      const row = await fetchManifestForApp(app.appKey);
      // fetchManifestForApp returns null only if the app doesn't
      // exist in AppRegistry — can't happen here since we just
      // listed them, but TypeScript needs the assert.
      if (!row) {
        return {
          appKey: app.appKey,
          appName: app.name,
          publicUrl: app.publicUrl ?? null,
          criticality: app.criticality,
          status: app.status,
          manifest: null,
          state: "not-onboarded" as const,
          fetchedAt: null,
        };
      }
      return row;
    }),
  );
}

/** Drift detection — flags any app whose installed components include
 *  `source: "override"` entries. Used by the v0.5.2 drift-audit
 *  governance action; ships in v0.5.1 as a building block. */
export function findOverrides(rows: AppManifestRow[]): {
  app: string;
  overrides: Manifest["overrides"];
}[] {
  return rows
    .filter((r) => r.manifest?.overrides?.length)
    .map((r) => ({ app: r.appKey, overrides: r.manifest!.overrides }));
}

export function clearManifestCache(): void {
  cache.clear();
}
