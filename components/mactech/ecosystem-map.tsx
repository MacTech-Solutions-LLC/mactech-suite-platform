"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export type NodeStatus = "healthy" | "drift" | "down" | "default";

export interface EcosystemNode {
  id: string;
  label: string;
  status?: NodeStatus;
  meta?: ReactNode;
  href?: string;
}

export interface ArcEvent {
  /** Source node id. */
  fromId: string;
  /** Optional id; an internally generated one is used otherwise. */
  id?: string;
}

export interface EcosystemMapProps {
  hubLabel?: string;
  nodes: EcosystemNode[];
  /** Live audit-event stream that spawns animated arcs. */
  arcs?: ArcEvent[];
  height?: number;
  onNodeClick?: (node: EcosystemNode) => void;
  className?: string;
  style?: CSSProperties;
}

const STATUS_FILL: Record<NodeStatus, string> = {
  healthy: "var(--mt-success)",
  drift: "var(--mt-warning)",
  down: "var(--mt-danger)",
  default: "var(--mt-accent)",
};

export function EcosystemMap({
  hubLabel = "Hub",
  nodes,
  arcs = [],
  height = 480,
  onNodeClick,
  className = "",
  style,
}: EcosystemMapProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: height });
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeArcs, setActiveArcs] = useState<
    { id: string; fromId: string; bornAt: number }[]
  >([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!arcs.length || reduced) return;
    const incoming = arcs.slice(-8).map((a, i) => ({
      id: a.id ?? `${a.fromId}-${Date.now()}-${i}`,
      fromId: a.fromId,
      bornAt: performance.now(),
    }));
    setActiveArcs((prev) => [...prev, ...incoming].slice(-8));
    const t = window.setTimeout(() => {
      setActiveArcs((prev) =>
        prev.filter((a) => performance.now() - a.bornAt < 3000),
      );
    }, 3200);
    return () => window.clearTimeout(t);
  }, [arcs, reduced]);

  const positioned = useMemo(() => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    const r = Math.min(size.w, size.h) * 0.36;
    return nodes.map((n, i) => {
      const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / nodes.length;
      return {
        ...n,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        cx,
        cy,
      };
    });
  }, [nodes, size]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-mt-3 border border-mt-hairline bg-mt-surface-1 ${className}`}
      style={{ height, ...style }}
    >
      <svg
        viewBox={`0 0 ${size.w} ${size.h}`}
        width={size.w}
        height={size.h}
        className="absolute inset-0"
      >
        <defs>
          <radialGradient id={`hub-glow-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--mt-accent)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--mt-accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`arc-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--mt-accent)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--mt-accent)" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Static spokes */}
        {positioned.map((p) => (
          <line
            key={`spoke-${p.id}`}
            x1={p.cx}
            y1={p.cy}
            x2={p.x}
            y2={p.y}
            stroke="var(--mt-hairline-2)"
            strokeWidth={1}
            opacity={hovered && hovered !== p.id ? 0.18 : 0.5}
          />
        ))}

        {/* Animated audit arcs */}
        <AnimatePresence>
          {activeArcs.map((a) => {
            const src = positioned.find((p) => p.id === a.fromId);
            if (!src) return null;
            const len = Math.hypot(src.x - src.cx, src.y - src.cy);
            return (
              <motion.line
                key={a.id}
                x1={src.x}
                y1={src.y}
                x2={src.cx}
                y2={src.cy}
                stroke={`url(#arc-${id})`}
                strokeWidth={2}
                strokeDasharray={len}
                initial={{ strokeDashoffset: len, opacity: 0.95 }}
                animate={{ strokeDashoffset: 0, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.6, ease: "easeOut" }}
              />
            );
          })}
        </AnimatePresence>

        {/* Hub */}
        <circle
          cx={size.w / 2}
          cy={size.h / 2}
          r={64}
          fill={`url(#hub-glow-${id})`}
        />
        <circle
          cx={size.w / 2}
          cy={size.h / 2}
          r={26}
          fill="var(--mt-bg-2)"
          stroke="var(--mt-accent)"
          strokeWidth={1.5}
        />
        <text
          x={size.w / 2}
          y={size.h / 2 + 4}
          textAnchor="middle"
          className="fill-mt-text"
          style={{
            font: "10px var(--mt-font-mono)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          {hubLabel.slice(0, 4)}
        </text>

        {/* Nodes */}
        {positioned.map((p) => {
          const status = (p.status ?? "default") as NodeStatus;
          const dim = hovered && hovered !== p.id ? 0.18 : 1;
          return (
            <g
              key={p.id}
              transform={`translate(${p.x}, ${p.y})`}
              opacity={dim}
              style={{ cursor: onNodeClick || p.href ? "pointer" : "default" }}
              onMouseEnter={() => setHovered(p.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                if (onNodeClick) onNodeClick(p);
                else if (p.href) window.location.href = p.href;
              }}
            >
              <circle
                r={20}
                fill="var(--mt-surface-3)"
                stroke="var(--mt-hairline-2)"
                strokeWidth={1}
              />
              <circle
                r={5}
                fill={STATUS_FILL[status]}
                style={
                  reduced
                    ? undefined
                    : { animation: "mt-pulse 2.2s ease-in-out infinite" }
                }
              />
              <text
                y={38}
                textAnchor="middle"
                className="fill-mt-text-2"
                style={{
                  font: "10px var(--mt-font-mono)",
                  letterSpacing: "0.08em",
                }}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover card */}
      <AnimatePresence>
        {hovered ? (
          <motion.div
            key={hovered}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="absolute right-4 top-4 max-w-[260px] rounded-mt-2 border border-mt-hairline-2 bg-mt-bg-2/90 p-3 backdrop-blur-md"
          >
            {(() => {
              const node = positioned.find((p) => p.id === hovered);
              if (!node) return null;
              return (
                <>
                  <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
                    {node.status ?? "default"}
                  </p>
                  <p className="mt-1 font-mt-sans text-sm font-semibold text-mt-text">
                    {node.label}
                  </p>
                  {node.meta ? (
                    <div className="mt-2 font-mt-mono text-xs text-mt-text-2">
                      {node.meta}
                    </div>
                  ) : null}
                </>
              );
            })()}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <style jsx>{`
        @keyframes mt-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
