/**
 * Sprint 54 — per-app detail view.
 * Shows the full manifest payload, component list with sources,
 * override list with reasons, and recent audit log entries scoped
 * to this app's design-related events.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { fetchManifestForApp } from "@/lib/services/design-manifests";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ appKey: string }>;
}

export default async function AppDetailPage({ params }: Params) {
  const { appKey } = await params;
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.DESIGN_VIEW);

  const row = await fetchManifestForApp(appKey);
  if (!row) notFound();

  await writeAuditLog({
    eventType: "design.app_view",
    eventCategory: "system",
    severity: "info",
    action: `design.app-view·${appKey}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    metadata: { app_key: appKey, manifest_state: row.state },
  });

  // Recent design-related audit log entries scoped to this app.
  // We match on action prefix design.* AND any of the appKey
  // patterns the writers use (action suffix or metadata).
  const recentAudit = await prisma.auditLog.findMany({
    where: {
      action: { startsWith: "design." },
      OR: [
        { action: { contains: appKey } },
        { metadataJson: { path: ["app_key"], equals: appKey } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      action: true,
      severity: true,
      actorEmail: true,
      createdAt: true,
    },
  });

  const m = row.manifest;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
          /admin/design / apps / {appKey}
        </p>
        <h1 className="font-mt-display text-3xl font-semibold tracking-tight text-mt-text">
          {row.appName}
        </h1>
        <p className="font-mt-mono text-xs uppercase tracking-wider text-mt-text-3">
          {row.criticality} · {row.status} · state: {row.state}
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

      {m ? (
        <>
          <section className="space-y-3">
            <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
              Combination
            </h2>
            <div
              data-mt-mood={m.mood}
              data-mt-palette={m.palette}
              className="rounded-mt-3 p-5"
              style={{
                background: "var(--mt-bg)",
                color: "var(--mt-text)",
                fontFamily: "var(--mt-font-sans)",
                border:
                  "var(--mt-border-width, 1px) solid var(--mt-hairline-2)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="block h-4 w-4 rounded-full"
                  style={{ background: "var(--mt-accent)" }}
                />
                <span
                  aria-hidden
                  className="block h-4 w-4 rounded-full"
                  style={{ background: "var(--mt-accent-2)" }}
                />
                <span
                  aria-hidden
                  className="block h-4 w-4 rounded-full"
                  style={{ background: "var(--mt-accent-3)" }}
                />
                <span
                  className="ml-2 font-mt-mono text-xs uppercase tracking-wider"
                  style={{ color: "var(--mt-text-2)" }}
                >
                  {m.mood} · {m.palette}
                </span>
              </div>
              <p
                className="mt-3 font-mt-display text-lg"
                style={{ color: "var(--mt-text)" }}
              >
                This panel renders inside {row.appName}&apos;s own subtree —
                what you see is what they ship.
              </p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-4">
              <h3 className="font-mt-display text-sm font-semibold uppercase tracking-wider text-mt-text-3">
                Manifest
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mt-mono text-xs text-mt-text-2">
                <dt className="text-mt-text-3">version</dt>
                <dd>{m.version}</dd>
                <dt className="text-mt-text-3">tokens</dt>
                <dd>{m.tokens_version}</dd>
                <dt className="text-mt-text-3">generator</dt>
                <dd className="truncate">{m.generator}</dd>
                <dt className="text-mt-text-3">generated</dt>
                <dd>{new Date(m.generated_at).toLocaleString()}</dd>
                {m.app.repo ? (
                  <>
                    <dt className="text-mt-text-3">repo</dt>
                    <dd className="truncate">
                      <a
                        href={m.app.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-mt-cyan"
                      >
                        {m.app.repo}
                      </a>
                    </dd>
                  </>
                ) : null}
                {m.app.deploy_url ? (
                  <>
                    <dt className="text-mt-text-3">deploy</dt>
                    <dd className="truncate">
                      <a
                        href={m.app.deploy_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-mt-cyan"
                      >
                        {m.app.deploy_url}
                      </a>
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>

            <div className="rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-4">
              <h3 className="font-mt-display text-sm font-semibold uppercase tracking-wider text-mt-text-3">
                Components ({m.components.length})
              </h3>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mt-mono text-xs text-mt-text-2">
                {m.components.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{c.name}</span>
                    {c.source === "override" ? (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
                        style={{
                          background: "var(--mt-amber)",
                          color: "var(--mt-bg)",
                        }}
                      >
                        OVR
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {m.overrides?.length ? (
            <section className="space-y-2">
              <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
                Overrides ({m.overrides.length})
              </h2>
              <div className="overflow-hidden rounded-mt-3 border border-mt-hairline bg-mt-surface-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--mt-surface-2)" }}>
                      <th className="px-3 py-2 text-left font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
                        Component
                      </th>
                      <th className="px-3 py-2 text-left font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.overrides.map((o, i) => (
                      <tr
                        key={`${o.component}-${i}`}
                        style={{ borderTop: "1px solid var(--mt-hairline)" }}
                      >
                        <td className="px-3 py-2 font-mt-mono text-sm text-mt-text">
                          {o.component}
                        </td>
                        <td className="px-3 py-2 font-mt-display text-sm text-mt-text-2">
                          {o.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {m.capabilities?.length ? (
            <section className="space-y-2">
              <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
                Capabilities
              </h2>
              <div className="flex flex-wrap gap-2">
                {m.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full bg-mt-surface-3 px-2 py-0.5 font-mt-mono text-xs uppercase tracking-wider text-mt-cyan"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
              Raw manifest
            </h2>
            <pre
              className="overflow-auto rounded-mt-3 border border-mt-hairline bg-mt-bg-2 p-4 font-mt-mono text-xs leading-relaxed text-mt-text-2"
              style={{ maxHeight: "30vh" }}
            >
              {JSON.stringify(m, null, 2)}
            </pre>
          </section>
        </>
      ) : (
        <div
          className="rounded-mt-3 border border-dashed border-mt-hairline-strong bg-mt-surface-1 p-8 text-center"
          style={{ color: "var(--mt-text-2)" }}
        >
          <p className="font-mt-display text-base">
            {row.state === "not-onboarded"
              ? "This app hasn't been onboarded yet."
              : row.state === "invalid"
                ? "The manifest at the deploy URL didn't parse against the v1 schema."
                : "The manifest endpoint didn't respond. Will retry in 5 min."}
          </p>
          {row.state === "not-onboarded" ? (
            <Link
              href={`/design/onboard/${appKey}`}
              className="mt-3 inline-flex items-center gap-2 rounded-mt-2 bg-mt-cyan px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-bg shadow-mt-cyan"
            >
              Onboard →
            </Link>
          ) : null}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
          Recent design events
        </h2>
        {recentAudit.length === 0 ? (
          <p className="font-mt-display text-sm text-mt-text-3">
            No audit entries yet.
          </p>
        ) : (
          <ul className="space-y-1 font-mt-mono text-xs text-mt-text-2">
            {recentAudit.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline justify-between gap-3 border-b border-mt-hairline pb-1"
              >
                <span className="text-mt-text">{e.action}</span>
                <span className="text-mt-text-3">{e.actorEmail ?? "—"}</span>
                <span className="text-mt-text-4">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
