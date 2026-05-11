/**
 * Sprint 54 — web onboarding wizard.
 * 4-step UI mirroring the CLI:
 *   1. Pick app (pre-filled from URL)
 *   2. Pick mood + palette (live preview)
 *   3. Pick components (deferred until v0.5.3 wires the manifest
 *      service to fetch /r/index.json — for now we link to the
 *      registry's component pages)
 *   4. Review and copy the one-line npx command for the team to run
 *      OR (v0.6) open a PR.
 *
 * URL-driven state. Each step is a search param; the form re-renders
 * with searchParams updates. Simple, bookmarkable, audit-friendly.
 */

import Link from "next/link";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import {
  MOOD_VALUES,
  PALETTE_VALUES,
  type Mood,
  type Palette,
} from "@mactech-solutions-llc/onboard";

export const dynamic = "force-dynamic";

const RECOMMENDED: Record<Mood, Palette> = {
  vivid: "cyan",
  quiet: "slate",
  editorial: "coral",
  industrial: "safety",
};

interface Search {
  step?: string;
  mood?: string;
  palette?: string;
}

export default async function OnboardWizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ appKey: string }>;
  searchParams: Promise<Search>;
}) {
  const { appKey } = await params;
  const sp = await searchParams;
  const step = Number(sp.step ?? 1);
  const mood = (MOOD_VALUES as readonly string[]).includes(sp.mood ?? "")
    ? (sp.mood as Mood)
    : "vivid";
  const palette = (PALETTE_VALUES as readonly string[]).includes(
    sp.palette ?? "",
  )
    ? (sp.palette as Palette)
    : RECOMMENDED[mood];

  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.DESIGN_MANAGE,
  );

  const app = await prisma.appRegistry.findUnique({ where: { appKey } });
  if (!app) notFound();

  await writeAuditLog({
    eventType: "design.onboard_wizard",
    eventCategory: "system",
    severity: "info",
    action: `design.onboard-wizard·${appKey}·step${step}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    metadata: { app_key: appKey, step, mood, palette },
  });

  const npxCommand = `cd path/to/${appKey} && NODE_AUTH_TOKEN=<read:packages PAT> npx @mactech-solutions-llc/onboard`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
          /admin/design / onboard / {appKey}
        </p>
        <h1 className="font-mt-display text-3xl font-semibold tracking-tight text-mt-text">
          Onboard {app.name}
        </h1>
        <p className="font-mt-mono text-xs uppercase tracking-wider text-mt-text-3">
          step {step} of 4
        </p>
        <div className="pt-2">
          <Link
            href="/design"
            className="font-mt-mono text-xs uppercase tracking-wider text-mt-text-3 hover:text-mt-cyan"
          >
            ← cancel
          </Link>
        </div>
      </header>

      <Stepper step={step} appKey={appKey} mood={mood} palette={palette} />

      {step === 1 ? (
        <Step1 appKey={appKey} appName={app.name} />
      ) : step === 2 ? (
        <Step2 appKey={appKey} mood={mood} palette={palette} />
      ) : step === 3 ? (
        <Step3 appKey={appKey} mood={mood} palette={palette} />
      ) : (
        <Step4
          appKey={appKey}
          appName={app.name}
          mood={mood}
          palette={palette}
          npxCommand={npxCommand}
        />
      )}
    </div>
  );
}

function Stepper({
  step,
  appKey,
  mood,
  palette,
}: {
  step: number;
  appKey: string;
  mood: Mood;
  palette: Palette;
}) {
  const labels = ["App", "Mood + palette", "Components", "Review"];
  return (
    <ol className="flex items-center gap-2 font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={n} className="flex items-center gap-2">
            <Link
              href={`/design/onboard/${appKey}?step=${n}&mood=${mood}&palette=${palette}`}
              className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 ${
                active
                  ? "bg-mt-cyan text-mt-bg"
                  : done
                    ? "bg-mt-surface-3 text-mt-text"
                    : "bg-mt-surface-2 text-mt-text-3"
              }`}
            >
              {n}
            </Link>
            <span className={active ? "text-mt-text" : ""}>{label}</span>
            {n < labels.length ? (
              <span className="text-mt-text-4">→</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Step1({ appKey, appName }: { appKey: string; appName: string }) {
  return (
    <section className="space-y-4 rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-5">
      <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
        1 · Confirm the app
      </h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mt-mono text-sm text-mt-text-2">
        <dt className="text-mt-text-3">name</dt>
        <dd className="text-mt-text">{appName}</dd>
        <dt className="text-mt-text-3">appKey</dt>
        <dd className="text-mt-text">{appKey}</dd>
      </dl>
      <Link
        href={`/design/onboard/${appKey}?step=2`}
        className="inline-flex items-center gap-2 rounded-mt-2 bg-mt-cyan px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-bg shadow-mt-cyan"
      >
        Continue →
      </Link>
    </section>
  );
}

function Step2({
  appKey,
  mood,
  palette,
}: {
  appKey: string;
  mood: Mood;
  palette: Palette;
}) {
  return (
    <section className="space-y-4 rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-5">
      <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
        2 · Pick mood + palette
      </h2>
      <form method="get" className="space-y-4">
        <input type="hidden" name="step" value="2" />
        <div>
          <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
            Mood
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MOOD_VALUES.map((m) => (
              <label
                key={m}
                className={`cursor-pointer rounded-mt-2 px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider ${
                  mood === m
                    ? "bg-mt-cyan text-mt-bg"
                    : "border border-mt-hairline bg-mt-surface-2 text-mt-text-2"
                }`}
              >
                <input
                  type="radio"
                  name="mood"
                  value={m}
                  defaultChecked={mood === m}
                  className="sr-only"
                />
                {m}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
            Palette (recommended: {RECOMMENDED[mood]})
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PALETTE_VALUES.map((p) => (
              <label
                key={p}
                className={`cursor-pointer rounded-mt-2 px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider ${
                  palette === p
                    ? "bg-mt-cyan text-mt-bg"
                    : "border border-mt-hairline bg-mt-surface-2 text-mt-text-2"
                }`}
              >
                <input
                  type="radio"
                  name="palette"
                  value={p}
                  defaultChecked={palette === p}
                  className="sr-only"
                />
                {p}
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          className="rounded-mt-2 bg-mt-cyan px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-bg shadow-mt-cyan"
        >
          Apply selection →
        </button>
      </form>
      <div
        data-mt-mood={mood}
        data-mt-palette={palette}
        className="rounded-mt-3 p-5"
        style={{
          background: "var(--mt-bg)",
          color: "var(--mt-text)",
          fontFamily: "var(--mt-font-sans)",
          border:
            "var(--mt-border-width, 1px) solid var(--mt-hairline-2)",
        }}
      >
        <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
          Live preview · {mood} + {palette}
        </p>
        <p
          className="mt-2 text-2xl font-semibold tracking-tight"
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--mt-accent), var(--mt-accent-2))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          The future, on time.
        </p>
      </div>
      <div className="flex gap-2">
        <Link
          href={`/design/onboard/${appKey}?step=1`}
          className="rounded-mt-2 border border-mt-hairline bg-mt-surface-2 px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-text-2"
        >
          ← Back
        </Link>
        <Link
          href={`/design/onboard/${appKey}?step=3&mood=${mood}&palette=${palette}`}
          className="rounded-mt-2 bg-mt-cyan px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-bg shadow-mt-cyan"
        >
          Continue →
        </Link>
      </div>
    </section>
  );
}

function Step3({
  appKey,
  mood,
  palette,
}: {
  appKey: string;
  mood: Mood;
  palette: Palette;
}) {
  return (
    <section className="space-y-4 rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-5">
      <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
        3 · Components
      </h2>
      <p className="font-mt-display text-sm text-mt-text-2">
        The CLI installs the tokens package and patches your stack with zero
        components. Add components after onboarding via{" "}
        <code className="font-mt-mono text-mt-cyan">npm run mactech:sync</code>{" "}
        — that command opens an interactive multi-select against the live
        registry index.
      </p>
      <p className="font-mt-display text-sm text-mt-text-2">
        Or browse the registry to plan ahead:{" "}
        <a
          href="https://mactech-design-registry-production.up.railway.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-mt-cyan underline-offset-2 hover:underline"
        >
          design.mactechsolutionsllc.com
        </a>
        .
      </p>
      <div className="flex gap-2">
        <Link
          href={`/design/onboard/${appKey}?step=2&mood=${mood}&palette=${palette}`}
          className="rounded-mt-2 border border-mt-hairline bg-mt-surface-2 px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-text-2"
        >
          ← Back
        </Link>
        <Link
          href={`/design/onboard/${appKey}?step=4&mood=${mood}&palette=${palette}`}
          className="rounded-mt-2 bg-mt-cyan px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-bg shadow-mt-cyan"
        >
          Continue →
        </Link>
      </div>
    </section>
  );
}

function Step4({
  appKey,
  appName,
  mood,
  palette,
  npxCommand,
}: {
  appKey: string;
  appName: string;
  mood: Mood;
  palette: Palette;
  npxCommand: string;
}) {
  return (
    <section className="space-y-4 rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-5">
      <h2 className="font-mt-display text-xl font-semibold tracking-tight text-mt-text">
        4 · Review and run
      </h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mt-mono text-sm text-mt-text-2">
        <dt className="text-mt-text-3">app</dt>
        <dd className="text-mt-text">{appName}</dd>
        <dt className="text-mt-text-3">mood</dt>
        <dd className="text-mt-text">{mood}</dd>
        <dt className="text-mt-text-3">palette</dt>
        <dd className="text-mt-text">{palette}</dd>
        <dt className="text-mt-text-3">tokens</dt>
        <dd className="text-mt-text">^0.4.1</dd>
      </dl>
      <div className="space-y-1">
        <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
          Run this in the {appKey} repo
        </p>
        <pre
          className="overflow-x-auto rounded-mt-2 border border-mt-hairline bg-mt-bg-2 p-3 font-mt-mono text-xs text-mt-text"
          style={{ whiteSpace: "pre-wrap" }}
        >
          {npxCommand}
        </pre>
        <p className="font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
          The CLI will ask the same two questions; pick {mood} + {palette}.
        </p>
      </div>
      <p
        className="rounded-mt-2 border border-dashed border-mt-hairline-strong bg-mt-surface-1 p-3 font-mt-display text-sm"
        style={{ color: "var(--mt-text-2)" }}
      >
        PR generation arrives in v0.6 — the wizard will open a PR against
        the app&apos;s repo with the patches pre-applied. Today it&apos;s a
        copy-paste hand-off.
      </p>
      <div className="flex gap-2">
        <Link
          href={`/design/onboard/${appKey}?step=3&mood=${mood}&palette=${palette}`}
          className="rounded-mt-2 border border-mt-hairline bg-mt-surface-2 px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-text-2"
        >
          ← Back
        </Link>
        <Link
          href={`/design/apps/${appKey}`}
          className="rounded-mt-2 bg-mt-cyan px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-bg shadow-mt-cyan"
        >
          Done · view app →
        </Link>
      </div>
    </section>
  );
}
