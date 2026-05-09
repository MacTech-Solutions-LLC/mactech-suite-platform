"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  Building2,
  Users,
  Boxes,
  KeyRound,
  ScrollText,
  PackageSearch,
  Siren,
  Settings,
  Hexagon,
  Webhook,
  TerminalSquare,
  Compass,
  Network,
  Globe2,
  GitBranch,
  Code2,
  Rocket,
  Activity,
  AlertOctagon,
  PlugZap,
  Cloud,
  Bot,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MacTech Suite sidebar — destination structure for the Command Center
 * era. Suite IS the product; Command Center IS the flagship capability.
 * Repository / Operations / Subdomains groups are placeholders for the
 * routes that land in slices 2-4; their nav entries are visible from
 * day one so the muscle memory matches the destination.
 *
 * Disabled items are routed to "#" + aria-disabled so a click in this
 * slice doesn't 404 — they light up as soon as their slice ships.
 */

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/command-center", label: "Command Center", icon: Compass },
      { href: "/admin/agents", label: "Agents", icon: Bot },
      { href: "/admin/agents/triggers", label: "Scheduled Triggers", icon: Clock },
    ],
  },
  {
    group: "Identity",
    items: [
      { href: "/admin/mactech-users", label: "MacTech Admins", icon: ShieldCheck },
      { href: "/admin/customer-orgs", label: "Customer Organizations", icon: Building2 },
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    group: "Access & Apps",
    items: [
      { href: "/admin/product-access", label: "Product Access", icon: Boxes },
      { href: "/admin/roles", label: "Roles & Permissions", icon: KeyRound },
      { href: "/admin/app-registry", label: "App Registry", icon: PackageSearch },
      { href: "/admin/subdomains", label: "Subdomains", icon: Globe2 },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/admin/ops/ecosystem", label: "Ecosystem", icon: Network },
      { href: "/admin/ops/traffic", label: "Traffic", icon: Activity },
      { href: "#deployments", label: "Railway Deployments", icon: Rocket, disabled: true },
      { href: "#incidents", label: "Incidents", icon: AlertOctagon, disabled: true },
      { href: "/admin/ops/risk", label: "Runtime Risk", icon: Siren },
    ],
  },
  {
    group: "Repositories",
    items: [
      { href: "/admin/repositories", label: "GitHub Repositories", icon: Code2 },
      { href: "/admin/repositories/commits", label: "Commit Intelligence", icon: GitBranch },
      { href: "/admin/repositories/workflow-runs", label: "Workflow Runs", icon: PlugZap },
      { href: "/admin/repositories/release-notes", label: "Release Notes", icon: ScrollText },
    ],
  },
  {
    group: "Compliance",
    items: [
      { href: "/admin/audit-logs", label: "Central Audit Logs", icon: ScrollText },
      { href: "/admin/security-events", label: "Security Events", icon: Siren },
    ],
  },
  {
    group: "Integrations",
    items: [
      { href: "/admin/api-keys", label: "API Keys", icon: TerminalSquare },
      { href: "/admin/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/admin/integrations/railway", label: "Railway", icon: Rocket },
      { href: "/admin/integrations/github", label: "GitHub", icon: Code2 },
      { href: "/admin/integrations/cloudflare", label: "Cloudflare", icon: Cloud },
    ],
  },
  {
    group: "Configuration",
    items: [{ href: "/admin/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  // Pick the single nav item whose href is the longest prefix of the
  // current pathname — avoids "/admin/agents" being highlighted when
  // we're actually on "/admin/agents/triggers".
  const activeHref = (() => {
    let best: string | null = null;
    for (const group of NAV) {
      for (const item of group.items) {
        if (item.disabled) continue;
        if (item.href === "#" || item.href.startsWith("#")) continue;
        if (pathname === item.href) {
          if (!best || item.href.length > best.length) best = item.href;
          continue;
        }
        if (item.href === "/dashboard") continue;
        if (pathname.startsWith(item.href + "/") || pathname.startsWith(item.href)) {
          if (!best || item.href.length > best.length) best = item.href;
        }
      }
    }
    return best;
  })();
  return (
    <aside className="hidden md:flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
      <Link
        href="/command-center"
        className="flex items-center gap-2 px-5 py-5 border-b border-border"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Hexagon className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            MacTech Suite
          </div>
          <div className="text-sm font-semibold">Command Center</div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
        {NAV.map((group) => (
          <div key={group.group} className="mb-5">
            <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.group}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = !item.disabled && activeHref === item.href;
                const Icon = item.icon;
                if (item.disabled) {
                  return (
                    <li key={item.href}>
                      <span
                        aria-disabled
                        title="Ships in a later Command Center slice"
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 text-muted-foreground/60 cursor-not-allowed"
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                        <span className="ml-auto text-[10px] uppercase tracking-widest">
                          soon
                        </span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors",
                        active
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span className="font-mono">v0.2.0</span>
          <span>Suite · Command Center</span>
        </div>
      </div>
    </aside>
  );
}
