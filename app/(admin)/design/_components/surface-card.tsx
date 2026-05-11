import Link from "next/link";

/**
 * Small action card linking into a Design Surface sub-route. Used
 * in the footer grid on /design.
 */
export function SurfaceCard({
  href,
  title,
  body,
  disabled = false,
}: {
  href: string;
  title: string;
  body: string;
  disabled?: boolean;
}) {
  const inner = (
    <article
      className="h-full space-y-1 rounded-mt-3 p-4 transition-transform"
      style={{
        background: "var(--mt-surface-1)",
        border: "var(--mt-border-width, 1px) solid var(--mt-hairline)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-mt-display text-base font-semibold tracking-tight text-mt-text">
          {title}
        </h3>
        <span
          aria-hidden
          className="font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3"
        >
          {disabled ? "—" : "→"}
        </span>
      </div>
      <p className="font-mt-display text-sm leading-relaxed text-mt-text-2">
        {body}
      </p>
    </article>
  );
  if (disabled) {
    return <div title="Disabled">{inner}</div>;
  }
  return (
    <Link href={href} className="block hover:-translate-y-0.5 transition-transform">
      {inner}
    </Link>
  );
}
