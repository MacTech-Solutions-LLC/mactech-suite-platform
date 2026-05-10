"use client";

/**
 * Sprint 51 — Vivid Operator Rail (B1).
 *
 * A collapsible left-side strip showing the apps the operator wants
 * fast access to. Two surfaces in one:
 *
 *   1. **Pinned apps** — apps the operator has explicitly tagged as
 *      "watching this." Persists to localStorage. Always at the top.
 *   2. **Priority queue** — apps that need attention right now
 *      (down > degraded > unknown), filled in below the pinned list.
 *
 * Width has two states: `collapsed` (40px, dots only) and `expanded`
 * (208px, full names + health text). State persists. The expand/
 * collapse handle is a magnetic CTA so it feels intentional.
 *
 * Why not a true pixel-drag resize: power users get the same "give
 * me my screen back" affordance with a one-click collapse, and
 * implementation is half the code, with no edge cases around
 * viewport-resize / mobile / a11y.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pin, PinOff, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_PINS = "mt-vivid-rail-pins-v1";
const STORAGE_COLLAPSED = "mt-vivid-rail-collapsed-v1";

export interface OperatorRailApp {
  appKey: string;
  name: string;
  criticality: string;
  /** "up" | "degraded" | "down" | "unknown" */
  health: string;
  openRisks: number;
  hasCriticalRisk: boolean;
}

interface Props {
  apps: OperatorRailApp[];
}

const HEALTH_COLOR: Record<string, string> = {
  up: "#B6FF6E",
  degraded: "#FFB454",
  down: "#FF6679",
  unknown: "#5D6373",
};

const HEALTH_RANK: Record<string, number> = {
  down: 0,
  degraded: 1,
  unknown: 2,
  up: 3,
};

export function OperatorRail({ apps }: Props) {
  const [pins, setPins] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PINS);
      if (raw) setPins(JSON.parse(raw));
      const c = localStorage.getItem(STORAGE_COLLAPSED);
      if (c === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const togglePin = (appKey: string) => {
    setPins((prev) => {
      const next = prev.includes(appKey)
        ? prev.filter((k) => k !== appKey)
        : [...prev, appKey];
      try {
        localStorage.setItem(STORAGE_PINS, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_COLLAPSED, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Pinned section: in pin order. Priority section: alerting apps
  // (not already pinned), sorted by health rank then name. Cap at 5
  // each so the rail stays scannable.
  const { pinned, priority } = useMemo(() => {
    const pinSet = new Set(pins);
    const byKey = new Map(apps.map((a) => [a.appKey, a]));
    const pinned = pins
      .map((k) => byKey.get(k))
      .filter((a): a is OperatorRailApp => Boolean(a));
    const priority = apps
      .filter(
        (a) =>
          !pinSet.has(a.appKey) &&
          (a.health !== "up" || a.hasCriticalRisk),
      )
      .sort((a, b) => {
        const r = (HEALTH_RANK[a.health] ?? 9) - (HEALTH_RANK[b.health] ?? 9);
        if (r !== 0) return r;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6);
    return { pinned, priority };
  }, [apps, pins]);

  // Pre-hydration we render the expanded shell (matches SSR), then
  // settle into stored state on the next tick. Avoids layout flash.
  const w = collapsed && hydrated ? "w-12" : "w-52";

  return (
    <aside
      className={cn(
        "sticky top-4 hidden shrink-0 self-start rounded-mt-3 border border-mt-hairline bg-mt-surface-1 transition-[width] duration-300 ease-mt-out backdrop-blur-mt-glass md:block",
        w,
      )}
      aria-label="Operator rail"
    >
      <div className="flex items-center justify-between gap-2 border-b border-mt-hairline px-2.5 py-2.5">
        {!collapsed || !hydrated ? (
          <span className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
            Operator
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-mt-1 text-mt-text-3 transition hover:bg-mt-surface-2 hover:text-mt-text"
          aria-label={collapsed ? "Expand operator rail" : "Collapse operator rail"}
        >
          {collapsed && hydrated ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {pinned.length > 0 ? (
        <RailGroup
          label="Pinned"
          collapsed={collapsed && hydrated}
          accent="#7C5CFF"
        >
          {pinned.map((a) => (
            <RailItem
              key={`pin-${a.appKey}`}
              app={a}
              pinned
              onTogglePin={togglePin}
              collapsed={collapsed && hydrated}
            />
          ))}
        </RailGroup>
      ) : null}

      {priority.length > 0 ? (
        <RailGroup
          label="Needs attention"
          collapsed={collapsed && hydrated}
          accent="#FF6679"
        >
          {priority.map((a) => (
            <RailItem
              key={`pri-${a.appKey}`}
              app={a}
              pinned={false}
              onTogglePin={togglePin}
              collapsed={collapsed && hydrated}
            />
          ))}
        </RailGroup>
      ) : null}

      {pinned.length === 0 && priority.length === 0 ? (
        <div className="px-3 py-6 text-center font-mt-mono text-[10px] uppercase tracking-[0.16em] text-mt-text-4">
          {collapsed && hydrated ? "—" : "All clear · pin an app from below to watch"}
        </div>
      ) : null}
    </aside>
  );
}

function RailGroup({
  label,
  accent,
  collapsed,
  children,
}: {
  label: string;
  accent: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-mt-hairline last:border-b-0">
      {!collapsed ? (
        <div className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: accent }}
          />
          <span className="font-mt-mono text-[9px] uppercase tracking-[0.18em] text-mt-text-3">
            {label}
          </span>
        </div>
      ) : null}
      <ul className="space-y-0.5 px-1.5 py-1.5">{children}</ul>
    </div>
  );
}

function RailItem({
  app,
  pinned,
  onTogglePin,
  collapsed,
}: {
  app: OperatorRailApp;
  pinned: boolean;
  onTogglePin: (appKey: string) => void;
  collapsed: boolean;
}) {
  const dot = HEALTH_COLOR[app.health] ?? HEALTH_COLOR.unknown;
  return (
    <li className="group relative">
      <Link
        href={`/admin/apps/${app.appKey}`}
        className={cn(
          "flex items-center gap-2 rounded-mt-1 px-2 py-1.5 transition hover:bg-mt-surface-2",
          collapsed ? "justify-center" : "",
        )}
        title={`${app.name} · ${app.health}${app.openRisks > 0 ? ` · ${app.openRisks} open risk(s)` : ""}`}
      >
        <span className="relative inline-flex h-2 w-2 shrink-0">
          <span
            className={cn(
              "absolute inset-0 rounded-full opacity-50",
              app.health === "down" || app.health === "degraded"
                ? "animate-mt-pulse-glow"
                : "",
            )}
            style={{ background: dot }}
          />
          <span
            className="relative inline-block h-2 w-2 rounded-full"
            style={{ background: dot }}
          />
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-mt-text-2 group-hover:text-mt-text">
              {app.name}
            </span>
            {app.openRisks > 0 ? (
              <span
                className={cn(
                  "shrink-0 font-mt-mono text-[9px] tabular-nums",
                  app.hasCriticalRisk ? "text-mt-rose" : "text-mt-amber",
                )}
              >
                {app.openRisks}
              </span>
            ) : null}
          </>
        ) : null}
      </Link>
      {!collapsed ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onTogglePin(app.appKey);
          }}
          aria-label={pinned ? `Unpin ${app.name}` : `Pin ${app.name}`}
          className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-mt-1 text-mt-text-4 opacity-0 transition hover:bg-mt-surface-3 hover:text-mt-text-2 focus:opacity-100 group-hover:opacity-100"
        >
          {pinned ? (
            <PinOff className="h-3 w-3" />
          ) : (
            <Pin className="h-3 w-3" />
          )}
        </button>
      ) : null}
    </li>
  );
}
