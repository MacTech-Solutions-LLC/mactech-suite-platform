/**
 * Sprint 44 — Vivid hero for /command-center.
 *
 * Replaces the standard `<PageHeader>` on this surface only. Other
 * admin routes keep PageHeader untouched.
 *
 * Layout:
 *   [brand mark] [eyebrow]                       [actions]
 *   Big kinetic display title — with an italic
 *   *Instrument Serif* em-phrase mid-sentence —
 *   plus a tagline below.
 *
 *   Brand tagline: "One sign-in, every app, full audit trail."
 */

import { KineticText } from "./kinetic-text";

export interface CCHeroProps {
  eyebrow: string;
  /** Title prefix — sans, before the italic em-phrase. */
  titlePrefix: string;
  /** Italic em-phrase — Instrument Serif italic. */
  titleEmphasis: string;
  /** Title suffix — sans, after the italic em-phrase. */
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
            <KineticText text={titlePrefix} as="span" />{" "}
            <span className="font-mt-serif italic font-normal text-transparent [background-image:linear-gradient(120deg,#00E5FF_0%,#7C5CFF_50%,#FF5BD0_100%)] [-webkit-background-clip:text] [background-clip:text]">
              {titleEmphasis}
            </span>
            {titleSuffix ? (
              <>
                {" "}
                <KineticText text={titleSuffix} as="span" startDelayMs={120} />
              </>
            ) : null}
          </h1>

          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-mt-text-2 md:text-base">
            {tagline}
          </p>
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {/* Hairline divider with gradient end-caps — separates the hero
          from the body without a flat <hr>. */}
      <div
        aria-hidden
        className="mt-8 h-px w-full"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.45) 18%, rgba(124,92,255,0.45) 50%, rgba(255,91,208,0.45) 82%, transparent 100%)",
        }}
      />
    </header>
  );
}

/**
 * Conic-gradient brand mark — 26×26, slow spin (8s). The animation
 * uses `animation-mt-spin-slow`; reduced-motion users still see the
 * gradient, just static (we control that via the media query in
 * globals.css if desired — for now the slow tempo is benign enough
 * to leave on).
 */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="relative inline-block h-[26px] w-[26px] rounded-full"
      style={{
        background:
          "conic-gradient(from 0deg, #00E5FF 0deg, #7C5CFF 140deg, #FF5BD0 240deg, #00E5FF 360deg)",
      }}
    >
      <span
        className="absolute inset-[3px] animate-mt-spin-slow rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.65) 90deg, transparent 180deg)",
          mixBlendMode: "overlay",
        }}
      />
      <span className="absolute inset-[6px] rounded-full bg-mt-bg" />
    </span>
  );
}
