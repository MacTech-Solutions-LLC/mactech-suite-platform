/**
 * Sprint 45 — server-renderable mini-sparkline (Vivid stat cards).
 *
 * Pure SVG, no client JS — small enough to inline inside RSC-rendered
 * stat cards. Values map to a smoothed area path; the last point also
 * gets a small dot in the accent color.
 *
 * Why not recharts here: recharts is client-only and ships kB; for a
 * 60-pixel-tall sparkline we want zero JS.
 */

export interface SparklineProps {
  values: number[];
  /** Width / height of the rendered SVG in CSS pixels. */
  width?: number;
  height?: number;
  /** Stroke + dot accent color. */
  color?: string;
  /** Fill opacity for the area beneath the line. */
  fillOpacity?: number;
  className?: string;
  /** Aria label — "Deploys per hour, last 24h" etc. */
  ariaLabel?: string;
}

export function Sparkline({
  values,
  width = 120,
  height = 36,
  color = "#00E5FF",
  fillOpacity = 0.18,
  className,
  ariaLabel = "Sparkline",
}: SparklineProps) {
  if (values.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        role="img"
        aria-label={`${ariaLabel} (no data)`}
      />
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const pad = 2;
  const usableH = height - pad * 2;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((v - min) / range) * usableH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const areaPath =
    `${linePath} L${(width).toFixed(2)},${height} L0,${height} Z`;

  const last = points[points.length - 1]!;
  const gradId = `spark-grad-${color.replace("#", "")}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={color} />
    </svg>
  );
}
