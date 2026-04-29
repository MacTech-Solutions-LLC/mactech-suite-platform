"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { updateSecurityEventStatus } from "@/lib/services/security-event-service";

const STATUSES = ["open", "investigating", "resolved", "ignored"] as const;

export interface SecurityEventRow {
  id: string;
  timestamp: Date;
  eventType: string;
  severity: string;
  status: string;
  description: string;
  sourceAppKey: string | null;
  metadataJson: unknown;
  customerOrganization: { name: string } | null;
}

export function SecurityEventDetailButton({ row }: { row: SecurityEventRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="View security event"
      >
        <Eye className="h-4 w-4" />
      </Button>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{row.eventType}</SheetTitle>
          <SheetDescription className="font-mono text-[10px]">id {row.id}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="grid gap-2 text-sm">
            <Row label="Timestamp" value={formatDateTime(row.timestamp)} />
            <Row label="Severity" value={<SeverityBadge severity={row.severity} />} />
            <Row label="Status" value={<StatusBadge status={row.status} />} />
            <Row label="Source app" value={row.sourceAppKey || "—"} />
            <Row label="Customer org" value={row.customerOrganization?.name || "—"} />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Description
            </div>
            <div className="rounded-md border border-border bg-card p-2 text-sm">
              {row.description}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Metadata
            </div>
            <pre className="max-h-60 overflow-auto rounded-md border border-border bg-card p-3 text-xs font-mono">
              {row.metadataJson != null
                ? JSON.stringify(row.metadataJson, null, 2)
                : "(no metadata)"}
            </pre>
          </div>

          <form
            className="space-y-3 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              const fd = new FormData(event.currentTarget);
              const status = String(fd.get("status") || row.status);
              const note = String(fd.get("note") || "");
              startTransition(async () => {
                try {
                  await updateSecurityEventStatus({
                    id: row.id,
                    status: status as (typeof STATUSES)[number],
                    note: note || undefined,
                  });
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to update");
                }
              });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="status">Update status</Label>
              <Select name="status" defaultValue={row.status}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="note">Note (audit trail only)</Label>
              <Textarea id="note" name="note" rows={3} />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <SheetFooter className="gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Update"}
              </Button>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 items-baseline gap-3 border-b border-border pb-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="col-span-2 text-sm break-words">{value}</div>
    </div>
  );
}
