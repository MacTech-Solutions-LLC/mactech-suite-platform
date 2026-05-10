/**
 * Sprint 44 — Vivid card / section primitives.
 *
 * Glass recipe (from the Stream OS reference):
 *   - bg-mt-surface-1 (4% white)
 *   - 1px hairline border (mt-hairline at 8% white)
 *   - top inner-shadow seam (1px white at 6% — `shadow-mt-glass`)
 *   - rounded-mt-3 (16px)
 *   - backdrop-blur-mt-glass (24px) with 150% saturation via inline
 *     style (Tailwind v3 doesn't expose a saturate-150% backdrop
 *     filter cleanly, so we set the whole `backdrop-filter` value
 *     inline)
 *
 * Variants:
 *   - tone="default" — neutral glass.
 *   - tone="cyan" / "violet" / "magenta" / "amber" / "rose" — adds an
 *     accent border-glow + a faint colored inner gradient. Used for
 *     attention-bearing surfaces (FixUnhealthy = rose, Awaiting
 *     approval = violet, Today digest = cyan).
 */

import { cn } from "@/lib/utils";

const TONE_STYLES = {
  default: {
    border: "border-mt-hairline",
    glow: "",
    accent: "",
  },
  cyan: {
    border: "border-mt-cyan/30",
    glow: "shadow-mt-cyan",
    accent:
      "before:bg-[radial-gradient(ellipse_60%_40%_at_0%_0%,rgba(0,229,255,0.12),transparent_60%)]",
  },
  violet: {
    border: "border-mt-violet/30",
    glow: "shadow-mt-violet",
    accent:
      "before:bg-[radial-gradient(ellipse_60%_40%_at_0%_0%,rgba(124,92,255,0.14),transparent_60%)]",
  },
  magenta: {
    border: "border-mt-magenta/30",
    glow: "shadow-mt-magenta",
    accent:
      "before:bg-[radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(255,91,208,0.14),transparent_60%)]",
  },
  amber: {
    border: "border-mt-amber/30",
    glow: "",
    accent:
      "before:bg-[radial-gradient(ellipse_60%_40%_at_0%_0%,rgba(255,180,84,0.10),transparent_60%)]",
  },
  rose: {
    border: "border-mt-rose/30",
    glow: "",
    accent:
      "before:bg-[radial-gradient(ellipse_60%_40%_at_0%_0%,rgba(255,102,121,0.12),transparent_60%)]",
  },
} as const;

export type VividTone = keyof typeof TONE_STYLES;

export interface VividCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: VividTone;
  /** When true, renders no padding; the consumer styles its own. */
  bare?: boolean;
}

export function VividCard({
  tone = "default",
  bare = false,
  className,
  children,
  ...rest
}: VividCardProps) {
  const t = TONE_STYLES[tone];
  return (
    <div
      {...rest}
      className={cn(
        "relative overflow-hidden rounded-mt-3 border bg-mt-surface-1 shadow-mt-glass",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-mt-3 before:content-['']",
        t.border,
        t.glow,
        t.accent,
        bare ? "" : "p-5 md:p-6",
        className,
      )}
      style={{
        backdropFilter: "blur(24px) saturate(150%)",
        WebkitBackdropFilter: "blur(24px) saturate(150%)",
        ...rest.style,
      }}
    >
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

/**
 * Sectional eyebrow + title used inside VividCard headers. Keeps the
 * Vivid pages consistent without forcing every consumer to re-import
 * the typography classes.
 */
export function VividSectionHeader({
  eyebrow,
  title,
  meta,
}: {
  eyebrow?: string;
  title: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="mt-1 font-mt-display text-base font-semibold tracking-tight text-mt-text md:text-lg">
          {title}
        </h2>
      </div>
      {meta ? (
        <div className="shrink-0 text-xs text-mt-text-3">{meta}</div>
      ) : null}
    </div>
  );
}
