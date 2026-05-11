/**
 * Sprint 53 — Design Surface (v0.5.1).
 *
 * Lists every app in AppRegistry alongside its mactech-manifest.json
 * state. Each card renders inside the *target app's own* data-mt-mood
 * + data-mt-palette subtree so the surface is an honest visualisation
 * of the suite's design-system state, not a mock.
 *
 * v0.5.1 ships: page shell + app grid + audit hook.
 * v0.5.2 will ship: component matrix (using data-table dogfooded
 *   from the registry), theme preview multi-app diff-viewer, drift-
 *   audit + CMMC PDF export, web onboarding flow.
 */

import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { fetchAllManifests, findOverrides } from "@/lib/services/design-manifests";
import { AppCard } from "./_components/app-card";
import { ManifestStats } from "./_components/manifest-stats";
import { SurfaceCard } from "./_components/surface-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Design Surface · MacTech Suite" };

export default async function DesignSurfacePage() {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.DESIGN_VIEW);

  const rows = await fetchAllManifests();
  const overrides = findOverrides(rows);

  // Audit every view. Federal-customer story: every design-system-
  // relevant action across the suite is auditable.
  await writeAuditLog({
    eventType: "design.view",
    eventCategory: "system",
    severity: "info",
    action: "design.view",
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    metadata: {
      app_count: rows.length,
      onboarded: rows.filter((r) => r.state === "ok").length,
      override_count: overrides.length,
    },
  });

  const onboarded = rows.filter((r) => r.state === "ok");
  const notOnboarded = rows.filter((r) => r.state !== "ok");

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
          Sprint 53 · Design Surface · v0.5.1
        </p>
        <h1 className="font-mt-display text-3xl font-semibold tracking-tight text-mt-text md:text-4xl">
          Design system across the suite
        </h1>
        <p className="max-w-3xl font-mt-display text-base leading-relaxed text-mt-text-2">
          Live state of <code>@mactech-solutions-llc/design-tokens</code> adoption
          across the MacTech Suite. Cards render in each app&apos;s own mood
          × palette so the page is an honest visualisation, not a mock.
          Every action on this page is in the audit log.
        </p>
      </header>

      <ManifestStats
        total={rows.length}
        onboarded={onboarded.length}
        notOnboarded={notOnboarded.length}
        overrideCount={overrides.length}
      />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
            Apps
          </h2>
          <span className="font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
            {onboarded.length} onboarded · {notOnboarded.length} pending
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <AppCard key={row.appKey} row={row} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
          Surfaces
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SurfaceCard
            href="/design/components"
            title="Component matrix"
            body="Rows = components, cols = onboarded apps. Dot = installed, OVR = overridden."
          />
          <SurfaceCard
            href="/design/preview"
            title="Theme preview"
            body="Pick source + target mood × palette. Affected apps render in the target combo."
          />
          <SurfaceCard
            href="/design/drift.csv"
            title="Drift audit · CSV"
            body="Every override across the suite, with reasons. Audit-logged + downloadable."
          />
          <SurfaceCard
            href={
              notOnboarded[0]
                ? `/design/onboard/${notOnboarded[0].appKey}`
                : "#"
            }
            title="Onboarding wizard"
            body={
              notOnboarded[0]
                ? `4-step flow mirroring the CLI. Next: ${notOnboarded[0].appName}.`
                : "Every app is already onboarded — nothing to do here."
            }
            disabled={!notOnboarded[0]}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-mt-3 border border-dashed border-mt-hairline-strong bg-mt-surface-1 p-5">
        <h2 className="font-mt-display text-lg font-semibold tracking-tight text-mt-text">
          Coming in v0.6
        </h2>
        <ul className="space-y-1 font-mt-display text-sm text-mt-text-2">
          <li>· Apply-across-suite via PR generation against each onboarded repo</li>
          <li>· Capability matrix once the first capability components ship</li>
          <li>· Bump-all-apps to latest tokens version with one-click PRs</li>
          <li>· View Transitions API for mood / palette swaps</li>
        </ul>
      </section>
    </div>
  );
}
