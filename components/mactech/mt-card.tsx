import { type HTMLAttributes, forwardRef } from "react";

export interface MtCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional accent tint for the top hairline highlight. */
  tone?: "default" | "cyan" | "violet" | "magenta" | "rose";
  /** Strip the chrome (border, surface, blur) so children own the visuals. */
  bare?: boolean;
}

const TONE_COLOR: Record<NonNullable<MtCardProps["tone"]>, string> = {
  default: "var(--mt-hairline-2)",
  cyan: "var(--mt-accent)",
  violet: "var(--mt-accent-2)",
  magenta: "var(--mt-accent-3)",
  rose: "var(--mt-danger)",
};

export const MtCard = forwardRef<HTMLDivElement, MtCardProps>(
  function MtCard({ className = "", tone = "default", bare = false, style, children, ...rest }, ref) {
    if (bare) {
      return (
        <div ref={ref} className={className} style={style} {...rest}>
          {children}
        </div>
      );
    }
    return (
      <div
        ref={ref}
        className={`relative overflow-hidden rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-5 backdrop-blur-md ${className}`}
        style={style}
        {...rest}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-4 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${TONE_COLOR[tone]}, transparent)`,
          }}
        />
        {children}
      </div>
    );
  },
);

export function MtCardHeader({
  eyebrow,
  title,
  meta,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex items-baseline justify-between gap-3 ${className}`}>
      <div>
        {eyebrow ? (
          <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
            {eyebrow}
          </p>
        ) : null}
        <h3 className="mt-1 font-mt-sans text-base font-semibold tracking-tight text-mt-text md:text-lg">
          {title}
        </h3>
      </div>
      {meta ? (
        <div className="font-mt-mono text-xs text-mt-text-3">{meta}</div>
      ) : null}
    </div>
  );
}
