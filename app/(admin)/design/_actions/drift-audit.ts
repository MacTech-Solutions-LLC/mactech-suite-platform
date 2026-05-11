"use server";

/**
 * Sprint 54 — drift audit.
 * Walks every manifest, emits one row per override declared by any
 * app. Wraps the CSV string so the route handler can stream it back.
 * Permission-gated; writes a design.audit-drift audit row.
 */

import {
  fetchAllManifests,
  type AppManifestRow,
} from "@/lib/services/design-manifests";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export interface DriftRow {
  appKey: string;
  appName: string;
  component: string;
  reason: string;
  tokensVersion: string;
  mood: string;
  palette: string;
}

export async function runDriftAudit(): Promise<{
  rows: DriftRow[];
  csv: string;
  manifestRows: AppManifestRow[];
}> {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.DESIGN_MANAGE,
  );

  const manifestRows = await fetchAllManifests();
  const rows: DriftRow[] = [];

  for (const r of manifestRows) {
    if (!r.manifest?.overrides?.length) continue;
    for (const o of r.manifest.overrides) {
      rows.push({
        appKey: r.appKey,
        appName: r.appName,
        component: o.component,
        reason: o.reason,
        tokensVersion: r.manifest.tokens_version,
        mood: r.manifest.mood,
        palette: r.manifest.palette,
      });
    }
  }

  // CSV — RFC4180-shaped, double-quote escape any field with comma/
  // quote/newline. Keep it tight; reports go to compliance reviewers.
  const escape = (s: string) =>
    /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const headers = [
    "app_key",
    "app_name",
    "component",
    "reason",
    "tokens_version",
    "mood",
    "palette",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.appKey,
        r.appName,
        r.component,
        r.reason,
        r.tokensVersion,
        r.mood,
        r.palette,
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\n");

  await writeAuditLog({
    eventType: "design.audit_drift",
    eventCategory: "system",
    severity: rows.length > 0 ? "warning" : "info",
    action: "design.audit-drift",
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    metadata: {
      override_count: rows.length,
      apps_with_overrides: new Set(rows.map((r) => r.appKey)).size,
      total_apps_scanned: manifestRows.length,
    },
  });

  return { rows, csv, manifestRows };
}
