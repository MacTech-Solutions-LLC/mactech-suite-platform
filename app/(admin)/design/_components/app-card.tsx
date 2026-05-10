/**
 * Card in the Design Surface app grid. Each card renders inside its
 * own data-mt-mood + data-mt-palette subtree so the visualisation is
 * honest — Capture's card looks like Capture, QMS's card looks like
 * QMS, etc. Cards for apps that haven't been onboarded fall back to
 * a neutral "Not yet" state.
 */

import Link from "next/link";
import type { AppManifestRow } from "@/lib/services/design-manifests";

const STATE_LABEL: Record<AppManifestRow["state"], string> = {
  ok: "synced",
  stale: "stale fetch",
  invalid: "invalid manifest",
  "not-onboarded": "not onboarded",
};

const STATE_TONE: Record<AppManifestRow["state"], string> = {
  ok: "var(--mt-lime)",
  stale: "var(--mt-amber)",
  invalid: "var(--mt-rose)",
  "not-onboarded": "var(--mt-text-3)",
};

export function AppCard({ row }: { row: AppManifestRow }) {
  const m = row.manifest;
  const onboarded = row.state === "ok" && m;

  // Each card scopes its own mood + palette so the visual matches
  // the actual app's rendering. Cards for un-onboarded apps render
  // in the neutral parent (whatever mood the Design Surface itself
  // is showing).
  const moodAttrs = onboarded
    ? { "data-mt-mood": m!.mood, "data-mt-palette": m!.palette }
    : {};

  return (
    <article
      {...moodAttrs}
      className="relative overflow-hidden p-4"
      style={{
        background: onboarded ? "var(--mt-bg)" : "var(--mt-surface-1)",
        color: "var(--mt-text)",
        fontFamily: "var(--mt-font-sans)",
        borderRadius: "var(--mt-radius-3)",
        border: onboarded
          ? "var(--mt-border-width, 1px) solid var(--mt-hairline-2)"
          : "1px dashed var(--mt-hairline-strong)",
        minHeight: 200,
      }}
    >
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <p
            className="font-mt-mono text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "var(--mt-text-3)" }}
          >
            {row.criticality}
          </p>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mt-mono text-[10px] uppercase tracking-wider"
            style={{
              background: "var(--mt-surface-3)",
              color: STATE_TONE[row.state],
              border: "1px solid var(--mt-hairline)",
            }}
          >
            <span
              aria-hidden
              className="block h-1.5 w-1.5 rounded-full"
              style={{ background: STATE_TONE[row.state] }}
            />
            {STATE_LABEL[row.state]}
          </span>
        </div>
        <p
          className="font-mt-display text-lg font-semibold tracking-tight"
          style={{ color: "var(--mt-text)" }}
        >
          {row.appName}
        </p>
      </header>

      {onboarded ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="block h-3 w-3 rounded-full"
              style={{
                background: "var(--mt-accent)",
                border: "1px solid var(--mt-hairline-2)",
              }}
            />
            <span
              aria-hidden
              className="block h-3 w-3 rounded-full"
              style={{
                background: "var(--mt-accent-2)",
                border: "1px solid var(--mt-hairline-2)",
              }}
            />
            <span
              aria-hidden
              className="block h-3 w-3 rounded-full"
              style={{
                background: "var(--mt-accent-3)",
                border: "1px solid var(--mt-hairline-2)",
              }}
            />
            <span
              className="ml-1 font-mt-mono text-[11px] uppercase tracking-wider"
              style={{ color: "var(--mt-text-2)" }}
            >
              {m!.mood} · {m!.palette}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mt-mono text-[11px] text-mt-text-2">
            <dt style={{ color: "var(--mt-text-3)" }}>tokens</dt>
            <dd>{m!.tokens_version}</dd>
            <dt style={{ color: "var(--mt-text-3)" }}>components</dt>
            <dd className="tabular-nums">{m!.components.length}</dd>
            {m!.overrides?.length ? (
              <>
                <dt style={{ color: "var(--mt-text-3)" }}>overrides</dt>
                <dd className="tabular-nums" style={{ color: "var(--mt-amber)" }}>
                  {m!.overrides.length}
                </dd>
              </>
            ) : null}
            <dt style={{ color: "var(--mt-text-3)" }}>regen</dt>
            <dd
              title={m!.generated_at}
              className="truncate"
              style={{ color: "var(--mt-text-2)" }}
            >
              {new Date(m!.generated_at).toLocaleDateString()}
            </dd>
          </dl>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p
            className="font-mt-display text-sm"
            style={{ color: "var(--mt-text-2)" }}
          >
            {row.state === "not-onboarded"
              ? "This app hasn't been onboarded yet."
              : row.state === "invalid"
                ? "The manifest at the deploy URL didn't parse against the v1 schema."
                : "The manifest endpoint didn't respond. Will retry in 5 min."}
          </p>
          {row.state === "not-onboarded" ? (
            <Link
              href={`/admin/design/onboard/${row.appKey}`}
              className="inline-flex items-center gap-2 rounded-mt-2 bg-mt-cyan px-3 py-1.5 font-mt-mono text-xs uppercase tracking-wider text-mt-bg shadow-mt-cyan"
            >
              Onboard →
            </Link>
          ) : null}
        </div>
      )}

      <footer
        className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-2 font-mt-mono text-[10px] uppercase tracking-wider"
        style={{
          background: "var(--mt-surface-2)",
          color: "var(--mt-text-3)",
          borderTop: "1px solid var(--mt-hairline)",
        }}
      >
        <span>{row.appKey}</span>
        {row.publicUrl ? (
          <a
            href={row.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-mt-text"
          >
            open →
          </a>
        ) : (
          <span>no deploy URL</span>
        )}
      </footer>
    </article>
  );
}
