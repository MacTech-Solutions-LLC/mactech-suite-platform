/**
 * Sprint 54 — theme preview.
 * Pick a source mood × palette, pick a target, see which apps would
 * be affected and how each would render. "Apply across suite" is
 * preview-only in v0.5.2; PR generation arrives in v0.6.
 *
 * Server-rendered with searchParams driving the picker so the route
 * stays bookmarkable and audit-loggable. Client-side interactivity is
 * limited to the form (set the search params; re-render).
 */

import Link from "next/link";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { fetchAllManifests } from "@/lib/services/design-manifests";
import {
  MOOD_VALUES,
  PALETTE_VALUES,
  type Mood,
  type Palette,
} from "@mactech-solutions-llc/onboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Theme preview · Design Surface" };

interface Search {
  fromMood?: string;
  fromPalette?: string;
  toMood?: string;
  toPalette?: string;
}

function normMood(v: string | undefined): Mood {
  return (MOOD_VALUES as readonly string[]).includes(v ?? "")
    ? (v as Mood)
    : "vivid";
}
function normPalette(v: string | undefined): Palette {
  return (PALETTE_VALUES as readonly string[]).includes(v ?? "")
    ? (v as Palette)
    : "cyan";
}

export default async function ThemePreviewPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const fromMood = normMood(sp.fromMood);
  const fromPalette = normPalette(sp.fromPalette);
  const toMood = normMood(sp.toMood);
  const toPalette = normPalette(sp.toPalette);

  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.DESIGN_VIEW);

  const rows = await fetchAllManifests();
  const onboarded = rows.filter((r) => r.state === "ok" && r.manifest);
  const affected = onboarded.filter(
    (r) =>
      r.manifest!.mood === fromMood && r.manifest!.palette === fromPalette,
  );

  await writeAuditLog({
    eventType: "design.preview_theme",
    eventCategory: "system",
    severity: "info",
    action: `design.preview-theme·${fromMood}+${fromPalette}→${toMood}+${toPalette}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    metadata: {
      from: { mood: fromMood, palette: fromPalette },
      to: { mood: toMood, palette: toPalette },
      affected_count: affected.length,
    },
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
          /admin/design / preview
        </p>
        <h1 className="font-mt-display text-3xl font-semibold tracking-tight text-mt-text">
          Theme preview
        </h1>
        <p className="max-w-3xl font-mt-display text-base leading-relaxed text-mt-text-2">
          Pick a source combination and a target. The preview shows every
          onboarded app that&apos;s currently on the source, rendered as it
          would look on the target.
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

      <form
        method="get"
        className="grid gap-4 rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-4 md:grid-cols-2"
      >
        <fieldset className="space-y-2">
          <legend className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
            From
          </legend>
          <ComboSelect
            label="Mood"
            name="fromMood"
            value={fromMood}
            options={MOOD_VALUES as unknown as string[]}
          />
          <ComboSelect
            label="Palette"
            name="fromPalette"
            value={fromPalette}
            options={PALETTE_VALUES as unknown as string[]}
          />
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
            To
          </legend>
          <ComboSelect
            label="Mood"
            name="toMood"
            value={toMood}
            options={MOOD_VALUES as unknown as string[]}
          />
          <ComboSelect
            label="Palette"
            name="toPalette"
            value={toPalette}
            options={PALETTE_VALUES as unknown as string[]}
          />
        </fieldset>
        <div className="md:col-span-2">
          <button
            type="submit"
            className="rounded-mt-2 bg-mt-cyan px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-bg shadow-mt-cyan"
          >
            Preview →
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
            Affected apps ({affected.length})
          </h2>
          <span className="font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
            currently on {fromMood} + {fromPalette}
          </span>
        </div>
        {affected.length === 0 ? (
          <div
            className="rounded-mt-3 border border-dashed border-mt-hairline-strong bg-mt-surface-1 p-8 text-center"
            style={{ color: "var(--mt-text-2)" }}
          >
            <p className="font-mt-display text-base">
              No onboarded apps are currently on {fromMood} + {fromPalette}.
              Pick a different source to see preview output.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {affected.map((r) => (
              <div
                key={r.appKey}
                className="overflow-hidden rounded-mt-3"
                style={{
                  border:
                    "var(--mt-border-width, 1px) solid var(--mt-hairline-2)",
                }}
              >
                <header
                  className="px-3 py-2 font-mt-mono text-[10px] uppercase tracking-wider"
                  style={{
                    background: "var(--mt-surface-2)",
                    color: "var(--mt-text-3)",
                  }}
                >
                  {r.appName} — {fromMood} + {fromPalette} → {toMood} +{" "}
                  {toPalette}
                </header>
                <div
                  data-mt-mood={toMood}
                  data-mt-palette={toPalette}
                  className="p-4"
                  style={{
                    background: "var(--mt-bg)",
                    color: "var(--mt-text)",
                    fontFamily: "var(--mt-font-sans)",
                  }}
                >
                  <p
                    className="font-mt-display text-sm font-semibold"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, var(--mt-accent), var(--mt-accent-2))",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    Operator dashboard
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--mt-text-2)" }}
                  >
                    {r.appName} on the proposed combination.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      aria-hidden
                      className="block h-3 w-3 rounded-full"
                      style={{ background: "var(--mt-accent)" }}
                    />
                    <span
                      aria-hidden
                      className="block h-3 w-3 rounded-full"
                      style={{ background: "var(--mt-accent-2)" }}
                    />
                    <span
                      aria-hidden
                      className="block h-3 w-3 rounded-full"
                      style={{ background: "var(--mt-accent-3)" }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        className="space-y-2 rounded-mt-3 border border-dashed border-mt-hairline-strong bg-mt-surface-1 p-4"
        style={{ color: "var(--mt-text-2)" }}
      >
        <h3 className="font-mt-display text-sm font-semibold uppercase tracking-wider text-mt-text-3">
          Apply across suite
        </h3>
        <p className="font-mt-display text-sm">
          Preview-only in v0.5.2. PR-generation across the affected repos
          arrives in v0.6 when the cross-app PR-bot lands. This page already
          writes its own audit row on every render so the &ldquo;what was
          considered, by whom, when&rdquo; story is intact today.
        </p>
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-mt-2 bg-mt-surface-3 px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-text-3"
          title="v0.6 feature"
        >
          Apply across {affected.length} apps (v0.6)
        </button>
      </section>
    </div>
  );
}

function ComboSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-16 font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="rounded-mt-1 border border-mt-hairline bg-mt-bg-2 px-2 py-1 font-mt-mono text-xs text-mt-text"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
