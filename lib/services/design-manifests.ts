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
  type Mood,
  type Palette,
} from "@mactech-solutions-llc/onboard";
import { prisma } from "@/lib/db/prisma";

export interface DesignManifestComponent {
  name: string;
  source?: string;
}

export interface DesignManifestOverride {
  component: string;
  reason: string;
}

export interface DesignManifest {
  mood: Mood;
  palette: Palette;
  version?: string | number;
  tokens_version: string;
  generator?: string;
  generated_at: string;
  app: {
    repo?: string | null;
    deploy_url?: string | null;
  };
  components: DesignManifestComponent[];
  overrides: DesignManifestOverride[];
  capabilities?: string[];
}

interface CachedEntry {
  manifest: DesignManifest | null;
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
  manifest: DesignManifest | null;
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

  let manifest: DesignManifest | null = null;
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
        manifest = normalizeDesignManifest(parsed.data);
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
  overrides: DesignManifest["overrides"];
}[] {
  return rows
    .filter((r) => r.manifest?.overrides?.length)
    .map((r) => ({ app: r.appKey, overrides: r.manifest!.overrides }));
}

export function clearManifestCache(): void {
  cache.clear();
}

function normalizeDesignManifest(raw: unknown): DesignManifest {
  const record = isRecord(raw) ? raw : {};
  const app = isRecord(record.app) ? record.app : {};

  return {
    ...record,
    mood: isMood(record.mood) ? record.mood : "vivid",
    palette: isPalette(record.palette) ? record.palette : "cyan",
    version: typeof record.version === "string" ? record.version : undefined,
    tokens_version:
      typeof record.tokens_version === "string" ? record.tokens_version : "unknown",
    generator: typeof record.generator === "string" ? record.generator : undefined,
    generated_at:
      typeof record.generated_at === "string"
        ? record.generated_at
        : new Date(0).toISOString(),
    app: {
      repo: typeof app.repo === "string" ? app.repo : null,
      deploy_url: typeof app.deploy_url === "string" ? app.deploy_url : null,
    },
    components: Array.isArray(record.components)
      ? record.components.flatMap((component) => {
          if (!isRecord(component) || typeof component.name !== "string") return [];
          return [
            {
              name: component.name,
              source: typeof component.source === "string" ? component.source : undefined,
            },
          ];
        })
      : [],
    overrides: Array.isArray(record.overrides)
      ? record.overrides.flatMap((override) => {
          if (!isRecord(override) || typeof override.component !== "string") return [];
          return [
            {
              component: override.component,
              reason: typeof override.reason === "string" ? override.reason : "override",
            },
          ];
        })
      : [],
    capabilities: Array.isArray(record.capabilities)
      ? record.capabilities.filter(
          (capability): capability is string => typeof capability === "string",
        )
      : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMood(value: unknown): value is Mood {
  return (
    value === "vivid" ||
    value === "quiet" ||
    value === "editorial" ||
    value === "industrial"
  );
}

function isPalette(value: unknown): value is Palette {
  return (
    value === "cyan" ||
    value === "forest" ||
    value === "coral" ||
    value === "safety" ||
    value === "violet" ||
    value === "slate"
  );
}
