/**
 * Sprint 44 — Vivid hero for /command-center.
 *
 * Sprint 55 rebase: hero quietened to ops-tooling restraint.
 *  - Static brand mark (was: spinning conic gradient).
 *  - Static title text (was: KineticText per-char rise).
 *  - Sans em-phrase in cyan (was: gradient italic Instrument Serif).
 *  - Plain `<Link>` CTAs (was: MagneticLink with cursor pull).
 *  - One accent color across CTAs (was: cyan + magenta + violet trio).
 *  - Flat hairline (was: gradient hairline).
 *  - CTA order is intentional: New → Public status → AgentOps.
 *
 * Replaces the standard `<PageHeader>` on this surface only. Other
 * admin routes keep PageHeader untouched.
 */

import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { NewSheetTrigger } from "./new-action-sheet";

export interface CCHeroProps {
  eyebrow: string;
  /** Title prefix — before the cyan em-phrase. */
  titlePrefix: string;
  /** Em-phrase — sans, cyan, normal weight. */
  titleEmphasis: string;
  /** Title suffix — after the cyan em-phrase. */
  titleSuffix?: string;
  tagline: string;
  actions?: React.ReactNode;
}

export function CCHero({
  eyebrow,
  titlePrefix,
  titleEmphasis,
  titleSuffix,
  tagline,
  actions,
}: CCHeroProps) {
  return (
    <header className="relative">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="font-mt-mono text-[11px] uppercase tracking-[0.18em] text-mt-text-3">
              {eyebrow}
            </span>
          </div>

          <h1 className="font-mt-display text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-mt-text md:text-5xl">
            <span>{titlePrefix}</span>{" "}
            <span className="text-mt-cyan">{titleEmphasis}</span>
            {titleSuffix ? (
              <>
                {" "}
                <span>{titleSuffix}</span>
              </>
            ) : null}
          </h1>

          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-mt-text-2 md:text-base">
            {tagline}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <NewSheetTrigger className="group inline-flex items-center gap-2 rounded-mt-2 border border-mt-cyan/30 bg-mt-cyan/10 px-3 py-1.5 font-mt-mono text-[11px] uppercase tracking-[0.18em] text-mt-cyan transition hover:bg-mt-cyan/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mt-cyan">
              <Plus className="h-3 w-3" aria-hidden />
              New
              <kbd className="rounded-mt-1 border border-mt-cyan/30 bg-mt-cyan/10 px-1 font-mt-mono text-[9px] tracking-normal text-mt-cyan">
                n
              </kbd>
            </NewSheetTrigger>
            <Link
              href="/status"
              className="group inline-flex items-center gap-2 rounded-mt-2 border border-mt-hairline-strong bg-mt-surface-1 px-3 py-1.5 font-mt-mono text-[11px] uppercase tracking-[0.18em] text-mt-text-2 transition hover:bg-mt-surface-2 hover:text-mt-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mt-cyan"
            >
              Public status
              <ArrowUpRight className="h-3 w-3 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/admin/agents"
              className="group inline-flex items-center gap-2 rounded-mt-2 border border-mt-violet/30 bg-mt-violet/10 px-3 py-1.5 font-mt-mono text-[11px] uppercase tracking-[0.18em] text-mt-violet transition hover:bg-mt-violet/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mt-violet"
            >
              AgentOps
              <ArrowUpRight className="h-3 w-3 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {/* Flat hairline divider — was a cyan/violet/magenta gradient. */}
      <div
        aria-hidden
        className="mt-8 h-px w-full bg-mt-hairline"
      />
    </header>
  );
}

/**
 * Static brand mark — 26x26. Two concentric rings in mt-cyan over the
 * page background. No spin, no conic gradient. Functions as a visual
 * anchor; not an animated brand statement.
 */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="relative inline-block h-[26px] w-[26px] rounded-full border border-mt-cyan/40 bg-mt-cyan/10"
    >
      <span className="absolute inset-[5px] rounded-full border border-mt-cyan/50" />
      <span className="absolute inset-[10px] rounded-full bg-mt-cyan" />
    </span>
  );
}
