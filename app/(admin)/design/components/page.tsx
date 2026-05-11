/**
 * Sprint 54 — Component matrix.
 * Rows: every component declared by any onboarded app's manifest.
 * Cols: onboarded apps.
 * Cells: dot if the app installs the component; "OVR" badge if it's
 * declared as a source: "override" entry; empty otherwise.
 *
 * v0.5.2 ships this as a focused server-rendered table using
 * MacSuite's existing UI patterns. v0.5.3 will dogfood the
 * registry's data-table (which needs tokens ^0.4.1; MacSuite is
 * on ^0.1.0 today).
 */

import Link from "next/link";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { fetchAllManifests } from "@/lib/services/design-manifests";

export const dynamic = "force-dynamic";
export const metadata = { title: "Component matrix · Design Surface" };

export default async function ComponentMatrixPage() {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.DESIGN_VIEW);
  const rows = await fetchAllManifests();
  const onboarded = rows.filter((r) => r.state === "ok" && r.manifest);

  await writeAuditLog({
    eventType: "design.matrix_view",
    eventCategory: "system",
    severity: "info",
    action: "design.matrix-view",
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    metadata: {
      app_count: onboarded.length,
    },
  });

  // Build the union of component names across all manifests.
  const allComponents = new Map<
    string,
    { name: string; categories: Set<string> }
  >();
  for (const r of onboarded) {
    for (const c of r.manifest!.components) {
      const entry =
        allComponents.get(c.name) ??
        { name: c.name, categories: new Set<string>() };
      // Manifest doesn't carry category; we tag from the file path
      // when available. For now leave categories empty — rendering
      // doesn't need them yet.
      allComponents.set(c.name, entry);
    }
  }
  const componentList = Array.from(allComponents.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Build cell lookup: componentName → appKey → {installed, override}.
  const cells: Record<
    string,
    Record<string, { installed: boolean; override: boolean }>
  > = {};
  for (const r of onboarded) {
    for (const c of r.manifest!.components) {
      cells[c.name] ??= {};
      cells[c.name][r.appKey] = {
        installed: true,
        override: c.source === "override",
      };
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
          Sprint 54 · /admin/design
        </p>
        <h1 className="font-mt-display text-3xl font-semibold tracking-tight text-mt-text">
          Component matrix
        </h1>
        <p className="max-w-3xl font-mt-display text-base leading-relaxed text-mt-text-2">
          {componentList.length} components across {onboarded.length} onboarded
          apps. Dot = installed. <span className="text-mt-amber">OVR</span> =
          overridden (the app ships a custom variant — drift signal worth
          checking).
        </p>
        <div className="pt-2">
          <Link
            href="/design"
            className="font-mt-mono text-xs uppercase tracking-wider text-mt-text-3 hover:text-mt-cyan"
          >
            ← back to Design Surface
          </Link>
        </div>
      </header>

      {componentList.length === 0 ? (
        <div
          className="rounded-mt-3 border border-dashed border-mt-hairline-strong bg-mt-surface-1 p-8 text-center"
          style={{ color: "var(--mt-text-2)" }}
        >
          <p className="font-mt-display text-base">
            No onboarded apps yet — the matrix populates when at least one app
            ships a <code>mactech-manifest.json</code> with components.
          </p>
        </div>
      ) : (
        <div
          className="overflow-auto rounded-mt-3 border border-mt-hairline bg-mt-surface-1"
          style={{ maxHeight: "70vh" }}
        >
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-mt-bg-2">
              <tr>
                <th
                  className="sticky left-0 z-20 bg-mt-bg-2 px-3 py-2 text-left font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3"
                  style={{
                    borderBottom: "1px solid var(--mt-hairline)",
                    minWidth: 240,
                  }}
                >
                  Component
                </th>
                {onboarded.map((r) => (
                  <th
                    key={r.appKey}
                    className="px-2 py-2 text-center font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3"
                    style={{
                      borderBottom: "1px solid var(--mt-hairline)",
                      minWidth: 88,
                    }}
                  >
                    {r.appKey}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {componentList.map((c) => (
                <tr key={c.name} className="hover:bg-mt-surface-2">
                  <td
                    className="sticky left-0 z-10 bg-mt-bg-2 px-3 py-2 font-mt-mono text-sm text-mt-text"
                    style={{
                      borderBottom: "1px solid var(--mt-hairline)",
                    }}
                  >
                    {c.name}
                  </td>
                  {onboarded.map((r) => {
                    const cell = cells[c.name]?.[r.appKey];
                    return (
                      <td
                        key={r.appKey}
                        className="px-2 py-2 text-center"
                        style={{
                          borderBottom: "1px solid var(--mt-hairline)",
                        }}
                      >
                        {cell?.installed ? (
                          cell.override ? (
                            <span
                              className="inline-block rounded-full px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-wider"
                              style={{
                                background: "var(--mt-amber)",
                                color: "var(--mt-bg)",
                              }}
                              title="Override"
                            >
                              OVR
                            </span>
                          ) : (
                            <span
                              aria-hidden
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ background: "var(--mt-cyan)" }}
                              title="Installed"
                            />
                          )
                        ) : (
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              background: "var(--mt-hairline-strong)",
                              opacity: 0.4,
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
