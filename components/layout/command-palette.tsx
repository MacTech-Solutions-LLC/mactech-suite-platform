"use client";

/**
 * CommandPalette — Sprint 31.
 *
 * Cmd-K (or Ctrl-K) anywhere in the admin shell pops a quick-jump
 * picker. Tabbed-on-open, fuzzy substring filter, arrow keys to
 * highlight, Enter to navigate. Esc/click-outside closes.
 *
 * Destinations are a curated list — every nav item in the sidebar
 * plus a handful of "quick actions" that don't have their own nav
 * entry (e.g. "Sync now" → /command-center with a fragment so the
 * sync button gets attention).
 *
 * Not using @radix-ui/react-command (cmdk) to avoid adding a dep
 * for what's a tiny surface. The Dialog primitive + a filtered
 * list element with manual keyboard handling is enough.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  Search,
  ArrowRight,
  Compass,
  Bot,
  Clock,
  Boxes,
  Network,
  Activity,
  Rocket,
  Siren,
  Globe2,
  Code2,
  GitBranch,
  PlugZap,
  ScrollText,
  TerminalSquare,
  Webhook,
  Cloud,
  KeyRound,
  Settings,
  ShieldCheck,
  Building2,
  Users,
  PackageSearch,
  Sparkles,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Destination {
  href: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Aliases pad the substring filter so "agent" matches "Agents",
   *  "AgentOps", "M2M", "API" etc. */
  aliases?: string[];
}

const DESTINATIONS: Destination[] = [
  // Overview
  { href: "/command-center", label: "Command Center", group: "Overview", icon: Compass },
  { href: "/admin/agents", label: "Agents", group: "Overview", icon: Bot, aliases: ["agentops", "m2m", "ai", "runs"] },
  { href: "/admin/agents?status=awaiting", label: "Agents · Awaiting approval", group: "Overview", icon: Bot },
  { href: "/admin/agents/triggers", label: "Scheduled Triggers", group: "Overview", icon: Clock, aliases: ["cron", "automation"] },
  { href: "/dashboard", label: "Dashboard", group: "Overview", icon: Compass },

  // Identity
  { href: "/admin/mactech-users", label: "MacTech Admins", group: "Identity", icon: ShieldCheck },
  { href: "/admin/customer-orgs", label: "Customer Organizations", group: "Identity", icon: Building2, aliases: ["orgs", "tenants"] },
  { href: "/admin/users", label: "Users", group: "Identity", icon: Users },

  // Access & Apps
  { href: "/admin/product-access", label: "Product Access", group: "Access & Apps", icon: Boxes, aliases: ["entitlements"] },
  { href: "/admin/roles", label: "Roles & Permissions", group: "Access & Apps", icon: KeyRound },
  { href: "/admin/app-registry", label: "App Registry", group: "Access & Apps", icon: PackageSearch },
  { href: "/admin/subdomains", label: "Subdomains", group: "Access & Apps", icon: Globe2, aliases: ["dns"] },

  // Operations
  { href: "/admin/ops/ecosystem", label: "Ecosystem", group: "Operations", icon: Network, aliases: ["graph", "dependencies"] },
  { href: "/admin/ops/traffic", label: "Traffic", group: "Operations", icon: Activity, aliases: ["calls", "edges"] },
  { href: "/admin/ops/deployments", label: "Railway Deployments", group: "Operations", icon: Rocket, aliases: ["deploys", "drift"] },
  { href: "/admin/ops/risk", label: "Runtime Risk", group: "Operations", icon: Siren, aliases: ["alerts", "flags"] },
  { href: "/admin/ops/risk?severity=critical", label: "Risk · Critical only", group: "Operations", icon: Siren },
  { href: "/admin/public-status", label: "Public Status Page admin", group: "Operations", icon: Globe2, aliases: ["status", "visibility"] },

  // Repositories
  { href: "/admin/repositories", label: "GitHub Repositories", group: "Repositories", icon: Code2 },
  { href: "/admin/repositories/commits", label: "Commit Intelligence", group: "Repositories", icon: GitBranch, aliases: ["commits", "code"] },
  { href: "/admin/repositories/commits?riskOnly=true", label: "Commits · Sensitive only", group: "Repositories", icon: GitBranch },
  { href: "/admin/repositories/workflow-runs", label: "Workflow Runs", group: "Repositories", icon: PlugZap, aliases: ["ci", "actions", "github actions"] },
  { href: "/admin/repositories/workflow-runs?failedOnly=true", label: "Workflows · Failures only", group: "Repositories", icon: PlugZap },
  { href: "/admin/repositories/release-notes", label: "Release Notes", group: "Repositories", icon: ScrollText },

  // Compliance
  { href: "/admin/audit-logs", label: "Central Audit Logs", group: "Compliance", icon: ScrollText, aliases: ["audit", "events", "history"] },
  { href: "/admin/security-events", label: "Security Events", group: "Compliance", icon: Siren, aliases: ["security", "alerts"] },

  // Integrations
  { href: "/admin/api-keys", label: "API Keys", group: "Integrations", icon: TerminalSquare },
  { href: "/admin/webhooks", label: "Webhooks", group: "Integrations", icon: Webhook },

  // Configuration
  { href: "/admin/settings", label: "Settings", group: "Configuration", icon: Settings },

  // Public
  { href: "/status", label: "Public status page (anonymous view)", group: "Public", icon: Globe2 },

  // Quick actions — open a target page that already has the affordance.
  { href: "/admin/agents#intent-builder", label: "Plan a new agent run", group: "Quick actions", icon: Sparkles },
  { href: "/command-center", label: "Sync now (Command Center reconciliation)", group: "Quick actions", icon: Cloud, aliases: ["reconcile"] },
];

interface CommandPaletteProps {
  /** When true, render the trigger button + the dialog. When false,
   *  render only the dialog (the trigger is the keyboard shortcut). */
  trigger?: boolean;
}

export function CommandPalette({ trigger = true }: CommandPaletteProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd-K / Ctrl-K opens; Esc closes (Dialog already does Esc, but
  // we keep the listener simple and just toggle open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When the dialog opens, autofocus the input and reset highlight.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return DESTINATIONS;
    return DESTINATIONS.filter((d) => {
      const hay = [d.label, d.group, ...(d.aliases ?? [])].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  const onItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const dest = filtered[highlight];
      if (dest) {
        setOpen(false);
        router.push(dest.href);
      }
    }
  };

  return (
    <>
      {trigger ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open command palette"
          className="hidden md:inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Search className="h-3 w-3" />
          <span>Jump to…</span>
          <kbd className="rounded-sm border border-border bg-background px-1 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-0 p-0">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Command className="h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onItemKeyDown}
              placeholder="Jump to anywhere — risks, agents, deploys, traffic…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Command palette search"
            />
            <kbd className="text-[10px] text-muted-foreground">esc</kbd>
          </div>
          <ul
            className="max-h-[60vh] overflow-y-auto py-1"
            role="listbox"
            aria-label="Destinations"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                No destinations match &ldquo;{query}&rdquo;.
              </li>
            ) : null}
            {filtered.map((d, i) => {
              const Icon = d.icon;
              const active = i === highlight;
              return (
                <li key={`${d.href}-${d.label}`} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(d.href);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm " +
                      (active
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-foreground">{d.label}</div>
                      <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                        {d.group}
                      </div>
                    </div>
                    {active ? (
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
