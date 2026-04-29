"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { Eye } from "lucide-react";
import type { AuditLogRow } from "@/components/tables/audit-log-table";

export function AuditLogDetailButton({ row }: { row: AuditLogRow }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="View audit log details"
      >
        <Eye className="h-4 w-4" />
      </Button>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="break-all">{row.eventType}</SheetTitle>
          <SheetDescription className="font-mono text-[10px]">
            id {row.id}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="grid gap-2 text-sm">
            <Row label="Timestamp" value={formatDateTime(row.timestamp)} />
            <Row label="Severity" value={<SeverityBadge severity={row.severity} />} />
            <Row label="Category" value={<Badge variant="muted">{row.eventCategory}</Badge>} />
            <Row label="Actor" value={row.actorEmail || "system"} />
            <Row label="Customer org" value={row.customerOrganization?.name || "—"} />
            <Row label="App" value={row.app?.appKey || "—"} />
            <Row label="Resource" value={`${row.resourceType ?? "—"} ${row.resourceId ?? ""}`} />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Action
            </div>
            <div className="rounded-md border border-border bg-card p-2 text-sm">
              {row.action}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Metadata (secrets redacted at write time)
            </div>
            <pre className="max-h-72 overflow-auto rounded-md border border-border bg-card p-3 text-xs font-mono">
              {row.metadataJson != null
                ? JSON.stringify(row.metadataJson, null, 2)
                : "(no metadata)"}
            </pre>
          </div>
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
