"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";

export interface BrushableSeries {
  id: string;
  label: string;
  color?: string;
  data: { t: number; v: number }[];
}

export interface BrushableChartProps {
  series: BrushableSeries[];
  height?: number;
  /** Optional callback when the brushed range changes; returns ms timestamps. */
  onBrushChange?: (range: { from: number; to: number } | null) => void;
  className?: string;
  style?: CSSProperties;
}

const FALLBACK_COLORS = [
  "var(--mt-accent)",
  "var(--mt-accent-2)",
  "var(--mt-accent-3)",
];

export function BrushableChart({
  series,
  height = 220,
  onBrushChange,
  className = "",
  style,
}: BrushableChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);

  // Recalculate width when the container changes.
  useMemo(() => {
    if (typeof window === "undefined") return;
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setWidth(node.clientWidth));
    ro.observe(node);
    return () => ro.disconnect();
  }, [ref.current]);

  const flat = series.flatMap((s) => s.data.map((d) => d.v));
  const tStamps = series[0]?.data.map((d) => d.t) ?? [];
  const tMin = tStamps[0] ?? 0;
  const tMax = tStamps[tStamps.length - 1] ?? 1;
  const vMax = flat.length ? Math.max(...flat) : 1;
  const padding = { top: 12, bottom: 28, left: 8, right: 8 };
  const innerW = Math.max(1, width - padding.left - padding.right);
  const innerH = height - padding.top - padding.bottom;

  function tToX(t: number) {
    if (tMax === tMin) return padding.left;
    return padding.left + ((t - tMin) / (tMax - tMin)) * innerW;
  }
  function vToY(v: number) {
    if (vMax === 0) return padding.top + innerH;
    return padding.top + innerH - (v / vMax) * innerH;
  }
  function xToT(x: number) {
    return tMin + ((x - padding.left) / innerW) * (tMax - tMin);
  }

  function lineFor(s: BrushableSeries) {
    if (!s.data.length) return "";
    return s.data
      .map(
        (d, i) =>
          `${i === 0 ? "M" : "L"}${tToX(d.t).toFixed(2)},${vToY(d.v).toFixed(2)}`,
      )
      .join(" ");
  }

  function areaFor(s: BrushableSeries) {
    if (!s.data.length) return "";
    const path = lineFor(s);
    const lastX = tToX(s.data[s.data.length - 1].t).toFixed(2);
    const baseY = (padding.top + innerH).toFixed(2);
    return `${path} L${lastX},${baseY} L${tToX(s.data[0].t).toFixed(2)},${baseY} Z`;
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setDrag({ start: x, end: x });
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHover({ x, t: xToT(x) });
    if (drag) setDrag({ start: drag.start, end: x });
  }
  function onPointerUp() {
    if (drag) {
      const from = xToT(Math.min(drag.start, drag.end));
      const to = xToT(Math.max(drag.start, drag.end));
      if (Math.abs(drag.start - drag.end) > 4) {
        onBrushChange?.({ from, to });
      } else {
        onBrushChange?.(null);
        setDrag(null);
      }
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`} style={style}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient
              key={s.id}
              id={`area-${s.id}`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop
                offset="0%"
                stopColor={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                stopOpacity="0.3"
              />
              <stop
                offset="100%"
                stopColor={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                stopOpacity="0"
              />
            </linearGradient>
          ))}
        </defs>

        {/* Horizontal hairlines */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + innerH * p}
            y2={padding.top + innerH * p}
            stroke="var(--mt-hairline)"
            strokeDasharray="2 4"
          />
        ))}

        {series.map((s, i) => {
          const color = s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
          return (
            <g key={s.id}>
              <path d={areaFor(s)} fill={`url(#area-${s.id})`} />
              <path
                d={lineFor(s)}
                stroke={color}
                strokeWidth={1.5}
                fill="none"
              />
            </g>
          );
        })}

        {/* Brush rectangle */}
        {drag ? (
          <rect
            x={Math.min(drag.start, drag.end)}
            y={padding.top}
            width={Math.abs(drag.start - drag.end)}
            height={innerH}
            fill="var(--mt-soft-accent)"
            stroke="var(--mt-accent)"
            strokeWidth={1}
            opacity={0.5}
          />
        ) : null}

        {/* Crosshair */}
        {hover ? (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={padding.top}
            y2={padding.top + innerH}
            stroke="var(--mt-accent)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.7}
          />
        ) : null}
      </svg>

      <div className="flex flex-wrap items-center gap-3 px-2 pt-2 font-mt-mono text-[10px] uppercase tracking-wider text-mt-text-3">
        {series.map((s, i) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span
              className="block h-2 w-2 rounded-full"
              style={{
                background:
                  s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
