"use client";

/**
 * FeedbackConsole — the interactive queue for /admin/feedback.
 *
 * Server component fetches the rows and hands them here as plain data.
 * This component owns filtering, selection, the detail dialog, per-item
 * triage (status + notes), and the "kick off a Claude session" dispatch.
 * All mutations hit the /api/feedback routes and then router.refresh() so
 * the server-rendered counts/rows re-fetch.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Sparkles,
  ExternalLink,
  Bot,
  Search,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export type FeedbackRow = {
  id: string;
  category: "bug" | "ux" | "feature" | "general";
  status: "new" | "acknowledged" | "dispatched" | "resolved" | "dismissed";
  content: string;
  pageUrl: string;
  elementSelector: string | null;
  elementId: string | null;
  elementClass: string | null;
  elementText: string | null;
  elementType: string | null;
  submittedBy: string | null;
  adminNotes: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  dispatchedByEmail: string | null;
  agentRunId: string | null;
  agentRunStatus: string | null;
};

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const CATEGORY_META: Record<
  FeedbackRow["category"],
  { label: string; variant: BadgeVariant }
> = {
  bug: { label: "Bug", variant: "destructive" },
  ux: { label: "UX", variant: "default" },
  feature: { label: "Feature", variant: "success" },
  general: { label: "General", variant: "muted" },
};

const STATUS_META: Record<
  FeedbackRow["status"],
  { label: string; variant: BadgeVariant }
> = {
  new: { label: "New", variant: "warning" },
  acknowledged: { label: "Acknowledged", variant: "secondary" },
  dispatched: { label: "Dispatched", variant: "default" },
  resolved: { label: "Resolved", variant: "success" },
  dismissed: { label: "Dismissed", variant: "muted" },
};

const STATUS_FILTERS = [
  { key: "open", label: "Open" },
  { key: "new", label: "New" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "dispatched", label: "Dispatched" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
] as const;

const CATEGORY_FILTERS = [
  { key: "all", label: "All" },
  { key: "bug", label: "Bug" },
  { key: "ux", label: "UX" },
  { key: "feature", label: "Feature" },
  { key: "general", label: "General" },
] as const;

const OPEN_STATUSES: FeedbackRow["status"][] = ["new", "acknowledged"];
const isOpen = (r: FeedbackRow) => OPEN_STATUSES.includes(r.status);

function hostOf(url: string): string {
  try {
    return new URL(url).host + new URL(url).pathname;
  } catch {
    return url;
  }
}

export function FeedbackConsole({
  rows,
  canManage,
  newCount,
}: {
  rows: FeedbackRow[];
  canManage: boolean;
  newCount: number;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]["key"]>("open");
  const [categoryFilter, setCategoryFilter] =
    useState<(typeof CATEGORY_FILTERS)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<FeedbackRow | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "open" && !isOpen(r)) return false;
      if (statusFilter !== "open" && statusFilter !== "all" && r.status !== statusFilter)
        return false;
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (q) {
        const hay = `${r.content} ${r.pageUrl} ${r.elementText ?? ""} ${
          r.submittedBy ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, categoryFilter, query]);

  const selectableIds = useMemo(
    () => filtered.filter(isOpen).map((r) => r.id),
    [filtered],
  );
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectableSelected) {
        selectableIds.forEach((id) => next.delete(id));
      } else {
        selectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  const selectedOpenCount = Array.from(selected).filter((id) =>
    rows.find((r) => r.id === id && isOpen(r)),
  ).length;

  const openTotal = rows.filter(isOpen).length;
  // If nothing is selected we dispatch every open item; otherwise just the
  // selected open ones.
  const dispatchCount = selectedOpenCount > 0 ? selectedOpenCount : openTotal;

  async function dispatch() {
    if (!canManage || dispatchCount === 0) return;
    setDispatching(true);
    try {
      const ids = selectedOpenCount > 0 ? Array.from(selected) : [];
      const res = await fetch("/api/feedback/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackIds: ids }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Dispatch failed (HTTP ${res.status})`);
      }
      toast({
        title: "Claude session started",
        description: `${data.dispatchedCount} item${
          data.dispatchedCount === 1 ? "" : "s"
        } bundled into an agent run. Review the plan in Agents.`,
        variant: "success",
      });
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (err) {
      toast({
        title: "Could not start the session",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDispatching(false);
    }
  }

  async function patchItem(
    id: string,
    body: { status?: FeedbackRow["status"]; adminNotes?: string | null },
  ) {
    const res = await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Update failed (HTTP ${res.status})`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{openTotal}</span> open
          {newCount > 0 ? (
            <>
              {" · "}
              <span className="font-medium text-[hsl(38_92%_60%)]">{newCount}</span> new
            </>
          ) : null}
          {selectedOpenCount > 0 ? (
            <>
              {" · "}
              <span className="font-medium text-foreground">{selectedOpenCount}</span>{" "}
              selected
            </>
          ) : null}
        </div>
        {canManage ? (
          <Button
            onClick={dispatch}
            disabled={dispatching || dispatchCount === 0}
            className="gap-2"
          >
            {dispatching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {selectedOpenCount > 0
              ? `Send ${selectedOpenCount} to Claude`
              : `Send all ${openTotal} open to Claude`}
          </Button>
        ) : null}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              active={statusFilter === f.key}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {CATEGORY_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              active={categoryFilter === f.key}
              onClick={() => setCategoryFilter(f.key)}
            >
              {f.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes, page, element, or reporter…"
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelectableSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all open feedback in view"
                    disabled={selectableIds.length === 0}
                  />
                </TableHead>
              ) : null}
              <TableHead className="w-24">Category</TableHead>
              <TableHead>Feedback</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-40">Reporter</TableHead>
              <TableHead className="w-28">Age</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmpty
                colSpan={canManage ? 7 : 6}
                message="No feedback matches these filters."
              />
            ) : (
              filtered.map((r) => {
                const cat = CATEGORY_META[r.category];
                const st = STATUS_META[r.status];
                return (
                  <TableRow key={r.id}>
                    {canManage ? (
                      <TableCell>
                        {isOpen(r) ? (
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={() => toggle(r.id)}
                            aria-label="Select feedback item"
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Badge variant={cat.variant}>{cat.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        className="block max-w-md text-left"
                      >
                        <span className="line-clamp-2 text-sm text-foreground hover:underline">
                          {r.content}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                          {hostOf(r.pageUrl)}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {r.agentRunId ? (
                          <Link
                            href={`/admin/agents/${r.agentRunId}`}
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            <Bot className="h-3 w-3" /> run
                          </Link>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.submittedBy || <span className="italic">anonymous</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setDetail(r)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <FeedbackDetailDialog
        item={detail}
        canManage={canManage}
        onClose={() => setDetail(null)}
        onChanged={() => startTransition(() => router.refresh())}
        patchItem={patchItem}
      />

      {isPending ? (
        <p className="text-xs text-muted-foreground">Refreshing…</p>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FeedbackDetailDialog({
  item,
  canManage,
  onClose,
  onChanged,
  patchItem,
}: {
  item: FeedbackRow | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  patchItem: (
    id: string,
    body: { status?: FeedbackRow["status"]; adminNotes?: string | null },
  ) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Reset the notes field whenever a different item is opened.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (item && item.id !== loadedId) {
    setLoadedId(item.id);
    setNotes(item.adminNotes ?? "");
    setCopied(false);
  }

  if (!item) return null;
  const cat = CATEGORY_META[item.category];
  const st = STATUS_META[item.status];

  async function setStatus(status: FeedbackRow["status"]) {
    if (!item) return;
    setStatusBusy(true);
    try {
      await patchItem(item.id, { status });
      toast({ title: `Marked ${STATUS_META[status].label.toLowerCase()}`, variant: "success" });
      onChanged();
      onClose();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setStatusBusy(false);
    }
  }

  async function saveNotes() {
    if (!item) return;
    setSavingNotes(true);
    try {
      await patchItem(item.id, { adminNotes: notes });
      toast({ title: "Notes saved", variant: "success" });
      onChanged();
    } catch (err) {
      toast({
        title: "Could not save notes",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingNotes(false);
    }
  }

  async function copySelector() {
    if (!item?.elementSelector) return;
    try {
      await navigator.clipboard.writeText(item.elementSelector);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant={cat.variant}>{cat.label}</Badge>
            <Badge variant={st.variant}>{st.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Note
            </div>
            <p className="whitespace-pre-wrap text-foreground">{item.content}</p>
          </div>

          <Field label="Page">
            <Link
              href={item.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all text-primary hover:underline"
            >
              {item.pageUrl}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </Link>
          </Field>

          {item.elementText ? (
            <Field label="Element location">
              <span className="font-mono text-xs text-foreground">{item.elementText}</span>
            </Field>
          ) : null}

          {item.elementSelector ? (
            <Field label="Selector">
              <div className="flex items-start gap-2">
                <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                  {item.elementSelector}
                </code>
                <Button variant="ghost" size="sm" onClick={copySelector} className="gap-1">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Reporter">
              {item.submittedBy || <span className="italic text-muted-foreground">anonymous</span>}
            </Field>
            <Field label="Filed">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </Field>
          </div>

          {item.agentRunId ? (
            <Field label="Agent run">
              <Link
                href={`/admin/agents/${item.agentRunId}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Bot className="h-3.5 w-3.5" />
                {item.agentRunStatus ? `${item.agentRunStatus} · ` : ""}view run
              </Link>
              {item.dispatchedByEmail ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  dispatched by {item.dispatchedByEmail}
                </span>
              ) : null}
            </Field>
          ) : null}

          {canManage ? (
            <Field label="Admin notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal triage notes…"
                rows={3}
              />
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveNotes}
                  disabled={savingNotes || notes === (item.adminNotes ?? "")}
                >
                  {savingNotes ? "Saving…" : "Save notes"}
                </Button>
              </div>
            </Field>
          ) : item.adminNotes ? (
            <Field label="Admin notes">
              <p className="whitespace-pre-wrap text-foreground">{item.adminNotes}</p>
            </Field>
          ) : null}
        </div>

        {canManage ? (
          <DialogFooter className="flex-wrap gap-2 sm:justify-start">
            {item.status !== "acknowledged" && isOpen(item) ? (
              <Button variant="outline" size="sm" disabled={statusBusy} onClick={() => setStatus("acknowledged")}>
                Acknowledge
              </Button>
            ) : null}
            <Button variant="outline" size="sm" disabled={statusBusy} onClick={() => setStatus("resolved")}>
              Mark resolved
            </Button>
            <Button variant="ghost" size="sm" disabled={statusBusy} onClick={() => setStatus("dismissed")}>
              Dismiss
            </Button>
            {item.status !== "new" ? (
              <Button variant="ghost" size="sm" disabled={statusBusy} onClick={() => setStatus("new")}>
                Reopen as new
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
