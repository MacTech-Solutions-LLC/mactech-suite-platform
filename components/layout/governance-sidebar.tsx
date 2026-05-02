"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Hexagon,
  ClipboardCheck,
  Landmark,
  BadgeCheck,
  UserCheck,
  FileText,
  GitBranch,
  Shield,
  Calculator,
  UsersRound,
  Lock,
  Award,
  LineChart,
  Flag,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: Array<{
  group: string;
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    group: "Overview",
    items: [{ href: "/governance", label: "Governance dashboard", icon: LayoutDashboard }],
  },
  {
    group: "Readiness & records",
    items: [
      { href: "/governance/readiness", label: "Readiness", icon: ClipboardCheck },
      { href: "/governance/corporate-vault", label: "Corporate vault", icon: Landmark },
      { href: "/governance/reps-certs", label: "Reps & certs", icon: BadgeCheck },
      { href: "/governance/eligibility", label: "Eligibility", icon: UserCheck },
    ],
  },
  {
    group: "Contract posture",
    items: [
      { href: "/governance/clauses", label: "Clauses", icon: FileText },
      { href: "/governance/flowdowns", label: "Flowdowns", icon: GitBranch },
      { href: "/governance/insurance", label: "Insurance", icon: Shield },
      { href: "/governance/accounting", label: "Accounting", icon: Calculator },
      { href: "/governance/teaming", label: "Teaming", icon: UsersRound },
    ],
  },
  {
    group: "Security & delivery",
    items: [
      { href: "/governance/cyber", label: "Cyber", icon: Lock },
      { href: "/governance/post-award", label: "Post-award", icon: Award },
      { href: "/governance/reporting", label: "Reporting", icon: LineChart },
    ],
  },
  {
    group: "Administration",
    items: [{ href: "/governance/admin", label: "Admin", icon: Settings2 }],
  },
];

export function GovernanceSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
      <Link
        href="/governance"
        className="flex items-center gap-2 px-5 py-5 border-b border-border"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Hexagon className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">MacTech</div>
          <div className="text-sm font-semibold">GovernanceOS</div>
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
                  (item.href !== "/governance" && pathname.startsWith(item.href));
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
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono">v0.1.0</span>
          <span className="flex items-center gap-1">
            <Flag className="h-3 w-3" />
            Governance plane
          </span>
        </div>
      </div>
    </aside>
  );
}
