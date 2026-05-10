"use client";

/**
 * Sprint 49 — keyboard shortcuts overlay (Vivid /command-center).
 *
 * Press `?` (Shift+/) to open. Press `?` again or Esc to close.
 * Lists the keyboard shortcuts available throughout the Suite — both
 * the existing Cmd+K palette and a few /command-center deep links
 * registered here for the operator's muscle memory.
 *
 * Implementation:
 *   - Listens for `?` at window level. Ignores when focus is inside
 *     a contenteditable / input / textarea (so typing "?" in the
 *     AskAI box doesn't trigger).
 *   - Lazy-mount: the sheet only renders DOM once the user has hit
 *     the key at least once.
 *   - Reuses the shadcn Dialog primitive but styles the content with
 *     Vivid tokens — the dialog stays scoped to this route, no global
 *     re-skin.
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Shortcut {
  keys: string[];
  label: string;
  group: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["⌘", "K"], label: "Open command palette (jump anywhere)", group: "Navigation" },
  { keys: ["N"], label: "Open the New action sheet", group: "Navigation" },
  { keys: ["?"], label: "Open this shortcuts overlay", group: "Navigation" },
  { keys: ["Esc"], label: "Close any open dialog or overlay", group: "Navigation" },

  { keys: ["G", "C"], label: "Go to Command Center", group: "Quick jumps" },
  { keys: ["G", "A"], label: "Go to AgentOps", group: "Quick jumps" },
  { keys: ["G", "S"], label: "Go to public status page", group: "Quick jumps" },

  { keys: ["⌘", "Enter"], label: "Submit Ask AI prompt", group: "Inputs" },
  { keys: ["Enter"], label: "Activate the highlighted command-palette result", group: "Inputs" },
];

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setMounted(true);
        setOpen((prev) => !prev);
      }
      // "g" prefix shortcuts — operator presses g, then a destination
      // letter within 1.2s. Implemented inline rather than as a
      // separate hook because the state lives entirely in closure.
      if (e.key.toLowerCase() === "g" && !isTypingTarget(e.target)) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1200);
        const onSecond = (ev: KeyboardEvent) => {
          const k = ev.key.toLowerCase();
          if (k === "c") window.location.assign("/command-center");
          else if (k === "a") window.location.assign("/admin/agents");
          else if (k === "s") window.location.assign("/status");
          clearTimeout(t);
          ctrl.abort();
        };
        window.addEventListener("keydown", onSecond, { signal: ctrl.signal, once: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!mounted) return null;

  const groups = SHORTCUTS.reduce<Record<string, Shortcut[]>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl gap-0 border-mt-hairline-strong bg-mt-bg-2 p-0 text-mt-text shadow-mt-glass">
        <div className="border-b border-mt-hairline px-5 py-4">
          <div className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
            Reference
          </div>
          <div className="mt-1 font-mt-display text-base font-semibold tracking-tight">
            Keyboard shortcuts
          </div>
        </div>
        <div className="grid gap-6 px-5 py-5 md:grid-cols-2">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
                {group}
              </div>
              <ul className="mt-2 space-y-2">
                {items.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-mt-text-2">{s.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k, i) => (
                        <kbd
                          key={`${s.label}-${i}`}
                          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-mt-1 border border-mt-hairline bg-mt-surface-2 px-1.5 font-mt-mono text-[10px] uppercase text-mt-text"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-mt-hairline px-5 py-3 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
          Tip — `g` then a destination letter jumps without opening the palette.
        </div>
      </DialogContent>
    </Dialog>
  );
}
