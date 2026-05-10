"use client";

import { Search } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  section?: string;
  keywords?: string[];
  onSelect?: () => void;
}

export interface MtCommandProps {
  items: CommandItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  empty?: ReactNode;
}

export function MtCommand({
  items,
  open,
  onOpenChange,
  placeholder = "Search…",
  empty,
}: MtCommandProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((i) => {
      if (i.label.toLowerCase().includes(q)) return true;
      if (i.hint?.toLowerCase().includes(q)) return true;
      if (i.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [items, query]);

  const grouped = useMemo(() => {
    const out = new Map<string, CommandItem[]>();
    for (const it of filtered) {
      const sec = it.section ?? "Results";
      if (!out.has(sec)) out.set(sec, []);
      out.get(sec)!.push(it);
    }
    return Array.from(out.entries());
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function pick(i: CommandItem) {
    i.onSelect?.();
    onOpenChange(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[active];
      if (target) pick(target);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-mt-bg/70 px-4 pt-[12vh] backdrop-blur-md"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-mt-3 border border-mt-hairline-2 bg-mt-bg-2 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-mt-hairline px-4 py-3">
          <Search className="h-4 w-4 text-mt-text-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            className="flex-1 bg-transparent font-mt-sans text-sm text-mt-text outline-none placeholder:text-mt-text-4"
          />
          <kbd className="rounded-mt-1 border border-mt-hairline bg-mt-surface-2 px-1.5 py-0.5 font-mt-mono text-[10px] text-mt-text-3">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center font-mt-sans text-sm text-mt-text-3">
              {empty ?? "No matches."}
            </div>
          ) : (
            grouped.map(([section, secItems]) => (
              <div key={section} className="px-2 py-1">
                <p className="px-2 py-1 font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-4">
                  {section}
                </p>
                {secItems.map((it) => {
                  const idx = filtered.indexOf(it);
                  const isActive = idx === active;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => pick(it)}
                      data-active={isActive}
                      className="flex w-full items-center justify-between rounded-mt-1 px-3 py-2 text-left font-mt-sans text-sm text-mt-text-2 data-[active=true]:bg-mt-surface-3 data-[active=true]:text-mt-text"
                    >
                      <span>{it.label}</span>
                      {it.hint ? (
                        <span className="font-mt-mono text-xs text-mt-text-3">
                          {it.hint}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
