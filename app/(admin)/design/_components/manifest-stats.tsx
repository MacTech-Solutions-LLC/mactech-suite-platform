/**
 * Top-of-page stat strip on the Design Surface. Render-only, no
 * interactivity — the heavy lifting lives in the app grid.
 */

export function ManifestStats({
  total,
  onboarded,
  notOnboarded,
  overrideCount,
}: {
  total: number;
  onboarded: number;
  notOnboarded: number;
  overrideCount: number;
}) {
  const adoption = total > 0 ? Math.round((onboarded / total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Apps total" value={total} />
      <Stat label="Onboarded" value={onboarded} accent />
      <Stat label="Pending" value={notOnboarded} />
      <Stat label="Adoption" value={`${adoption}%`} accent />
      <Stat label="Components used" value="—" hint="v0.5.2" />
      <Stat label="Overrides" value={overrideCount} />
      <Stat label="Drift events / 30d" value="—" hint="v0.5.2" />
      <Stat label="Last regen" value="just now" hint="manifest service" />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-mt-2 border border-mt-hairline bg-mt-surface-1 p-3">
      <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
        {label}
      </p>
      <p
        className="mt-1 font-mt-display text-2xl font-semibold tracking-tight tabular-nums"
        style={{ color: accent ? "var(--mt-cyan)" : "var(--mt-text)" }}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 font-mt-mono text-[9px] uppercase tracking-wider text-mt-text-4">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
