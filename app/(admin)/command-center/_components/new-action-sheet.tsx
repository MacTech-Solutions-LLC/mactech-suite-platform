"use client";

/**
 * Sprint 51 — Unified "New" sheet (B3).
 *
 * One keystroke (`n`) — or the magnetic "New" pill in the hero —
 * opens a Vivid-skinned Dialog listing every creatable thing in the
 * Suite. Fuzzy substring filter; arrow keys to navigate; Enter to
 * jump to the relevant form.
 *
 * Each entry is one of:
 *   - dedicated /new page (e.g. `/admin/agents/triggers/new`)
 *   - existing surface with a fragment that opens an inline form
 *     (e.g. `/admin/agents#intent-builder`)
 *   - existing surface where the create button is the default CTA
 *     (e.g. `/admin/api-keys`)
 *
 * The sheet is registry-driven — adding a new "creatable" is one
 * line in `ACTIONS` below.
 *
 * Why a registry instead of "scan all routes": the sheet's value is
 * curation. Scanning would surface every form including ones an
 * operator should not be opening from a global shortcut.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Clock,
  KeyRound,
  Webhook,
  Building2,
  Users,
  PackageSearch,
  Siren,
  Plus,
  Sparkles,
  ArrowRight,
  Search,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface CreateAction {
  href: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  /** Aliases pad the substring filter. */
  aliases?: string[];
}

const ACTIONS: CreateAction[] = [
  {
    href: "/admin/agents#intent-builder",
    label: "Agent run",
    group: "AgentOps",
    icon: Bot,
    description:
      "Plan a new agent run via the IntentBuilder — declares goal, invariants, capabilities.",
    aliases: ["intent", "ai", "plan", "task"],
  },
  {
    href: "/admin/agents/triggers/new",
    label: "Scheduled trigger",
    group: "AgentOps",
    icon: Clock,
    description: "Cron-style schedule that fires an agent run on cadence.",
    aliases: ["cron", "schedule", "automation"],
  },
  {
    href: "/admin/api-keys",
    label: "API key",
    group: "Integrations",
    icon: KeyRound,
    description: "Issue a Suite API key for an external service or M2M caller.",
    aliases: ["m2m", "token", "credential"],
  },
  {
    href: "/admin/webhooks",
    label: "Webhook subscription",
    group: "Integrations",
    icon: Webhook,
    description: "Subscribe an external system to Suite events.",
    aliases: ["subscription", "events", "notifications"],
  },
  {
    href: "/admin/customer-orgs",
    label: "Customer organization",
    group: "Identity",
    icon: Building2,
    description:
      "Onboard a customer org — slug, domain, tier, CMMC target level.",
    aliases: ["org", "tenant", "customer"],
  },
  {
    href: "/admin/users",
    label: "User invitation",
    group: "Identity",
    icon: Users,
    description:
      "Invite a teammate to the Suite — Clerk handles the email + auth.",
    aliases: ["invite", "user", "teammate"],
  },
  {
    href: "/admin/app-registry",
    label: "App in registry",
    group: "Access & Apps",
    icon: PackageSearch,
    description:
      "Register a new MacTech app — name, criticality, repo + Railway links.",
    aliases: ["app", "registry", "service"],
  },
  {
    href: "/admin/ops/risk",
    label: "Manual risk flag",
    group: "Operations",
    icon: Siren,
    description:
      "Open a risk flag the autonomic detectors haven't surfaced yet.",
    aliases: ["alert", "incident", "risk"],
  },
];

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function NewActionSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Open on plain `n` when not typing somewhere. Modifier keys
      // pass through (Cmd+N is browser "new window," not ours).
      if (
        e.key === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        setMounted(true);
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Make `openNewActionSheet()` callable from the magnetic CTA pill.
  // Implementation: window-level CustomEvent. Cleaner than a context
  // for one consumer.
  useEffect(() => {
    const onOpen = () => {
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener("mt:open-new-sheet", onOpen);
    return () => window.removeEventListener("mt:open-new-sheet", onOpen);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return ACTIONS;
    return ACTIONS.filter((a) => {
      const hay = [a.label, a.group, a.description, ...(a.aliases ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = filtered[highlight];
      if (a) {
        setOpen(false);
        router.push(a.href);
      }
    }
  };

  if (!mounted) return null;

  // Group filtered results.
  const groups = filtered.reduce<Record<string, CreateAction[]>>((acc, a) => {
    (acc[a.group] ??= []).push(a);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 border-mt-hairline-strong bg-mt-bg-2 p-0 text-mt-text shadow-mt-glass">
        <div className="flex items-center gap-2 border-b border-mt-hairline px-4 py-3">
          <Sparkles className="h-4 w-4 text-mt-cyan" aria-hidden />
          <span className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
            New
          </span>
          <div className="ml-2 flex flex-1 items-center gap-2">
            <Search className="h-3.5 w-3.5 text-mt-text-4" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Filter — agent, key, webhook, org…"
              className="w-full bg-transparent text-sm text-mt-text outline-none placeholder:text-mt-text-4"
              aria-label="Filter create actions"
            />
          </div>
          <kbd className="font-mt-mono text-[9px] uppercase tracking-[0.16em] text-mt-text-4">
            esc
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
              Nothing matches “{query}”.
            </div>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group} className="border-b border-mt-hairline last:border-b-0">
                <div className="px-4 pt-3 pb-1 font-mt-mono text-[9px] uppercase tracking-[0.18em] text-mt-text-3">
                  {group}
                </div>
                <ul role="listbox" aria-label={group}>
                  {items.map((a) => {
                    const flatIndex = filtered.indexOf(a);
                    const active = flatIndex === highlight;
                    const Icon = a.icon;
                    return (
                      <li key={a.href + a.label} role="option" aria-selected={active}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            router.push(a.href);
                          }}
                          onMouseEnter={() => setHighlight(flatIndex)}
                          className={
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition " +
                            (active
                              ? "bg-mt-cyan/10"
                              : "hover:bg-mt-surface-2/60")
                          }
                        >
                          <span
                            className={
                              "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-mt-1 border " +
                              (active
                                ? "border-mt-cyan/40 bg-mt-cyan/10 text-mt-cyan"
                                : "border-mt-hairline bg-mt-surface-1 text-mt-text-3")
                            }
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-mt-display text-sm font-medium text-mt-text">
                              {a.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-mt-text-3">
                              {a.description}
                            </span>
                          </span>
                          {active ? (
                            <ArrowRight
                              className="mt-1.5 h-3.5 w-3.5 shrink-0 text-mt-cyan"
                              aria-hidden
                            />
                          ) : (
                            <Plus
                              className="mt-1.5 h-3 w-3 shrink-0 text-mt-text-4"
                              aria-hidden
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-mt-hairline px-4 py-2.5 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
          Tip — press `n` anywhere on /command-center to open this sheet.
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tiny client trigger button — emits a window CustomEvent that the
 * sheet listens for. Lets server-rendered surfaces (the hero CTA
 * pills) wire a magnetic button without prop-drilling state.
 */
export function NewSheetTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("mt:open-new-sheet"))}
      className={className}
    >
      {children}
    </button>
  );
}
