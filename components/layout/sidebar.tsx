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
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: Array<{
  group: string;
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
    group: "Configuration",
    items: [{ href: "/admin/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-5 py-5 border-b border-border"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Hexagon className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            MacTech
          </div>
          <div className="text-sm font-semibold">Identity Command Center</div>
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
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
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
          <span className="font-mono">v0.1.0</span>
          <span>Defense-grade SaaS</span>
        </div>
      </div>
    </aside>
  );
}
