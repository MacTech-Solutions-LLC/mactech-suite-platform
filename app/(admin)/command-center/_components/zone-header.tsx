/**
 * Sprint 55 — ZoneHeader primitive.
 *
 * The page reshape (LP1 in the research brief) groups the previous
 * 9-block stack into three named zones: "Right now", "Last 24 hours",
 * "Drill in". Each zone has a hairline-anchored header with an
 * uppercase mono eyebrow + display title + optional right-aligned
 * meta slot (used by Zone B for the inline count chips).
 *
 * Why a primitive instead of inlining: there are exactly three zone
 * headers and they need to read as a series. A primitive guarantees
 * vertical rhythm + typography stay in lockstep across them.
 */

import { cn } from "@/lib/utils";

interface Props {
  /** Mono uppercase eyebrow — e.g. "ZONE A". */
  eyebrow: string;
  /** Display title — e.g. "Right now". */
  title: string;
  /** Optional right-aligned meta — typically count chips or a short summary. */
  meta?: React.ReactNode;
  /** Optional anchor id for jump-shortcuts (Cmd+K / `g`). */
  id?: string;
  /** Border/accent tone — defaults to neutral hairline. Zone A uses cyan to flag priority. */
  tone?: "default" | "cyan";
  className?: string;
}

const TONE_BORDER: Record<NonNullable<Props["tone"]>, string> = {
  default: "border-mt-hairline",
  cyan: "border-mt-cyan/30",
};

export function ZoneHeader({
  eyebrow,
  title,
  meta,
  id,
  tone = "default",
  className,
}: Props) {
  return (
    <div
      id={id}
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 border-b pb-3",
        TONE_BORDER[tone],
        className,
      )}
    >
      <div className="min-w-0">
        <div className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
          {eyebrow}
        </div>
        <h2 className="mt-1 font-mt-display text-lg font-semibold tracking-tight text-mt-text md:text-xl">
          {title}
        </h2>
      </div>
      {meta ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{meta}</div>
      ) : null}
    </div>
  );
}
