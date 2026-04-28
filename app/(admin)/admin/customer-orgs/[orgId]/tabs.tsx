"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function CustomerOrgTabs({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/admin/customer-orgs/${orgId}`, label: "Overview", exact: true },
    { href: `/admin/customer-orgs/${orgId}/users`, label: "Users" },
    { href: `/admin/customer-orgs/${orgId}/entitlements`, label: "Product Access" },
    { href: `/admin/customer-orgs/${orgId}/audit`, label: "Audit Logs" },
  ];
  return (
    <div className="flex gap-1 rounded-md border border-border bg-card p-1 text-sm overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-sm px-3 py-1.5 transition-colors whitespace-nowrap",
              active
                ? "bg-secondary text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
