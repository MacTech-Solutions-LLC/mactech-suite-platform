import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { AuditLogDetailButton } from "@/components/drawers/audit-log-detail-drawer";

export interface AuditLogRow {
  id: string;
  timestamp: Date;
  severity: string;
  eventCategory: string;
  eventType: string;
  action: string;
  actorEmail: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadataJson: unknown;
  customerOrganization: { name: string } | null;
  app: { appKey: string; name: string } | null;
}

/**
 * Sprint 25: each link narrows the audit-log feed to events sharing
 * one attribute. Fresh filter (existing search params not preserved)
 * — operators clicking "follow this actor" almost always want the
 * full history, not the current time window.
 */
function followLink(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `/admin/audit-logs${qs ? `?${qs}` : ""}`;
}

export function AuditLogTable({ rows }: { rows: AuditLogRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Org</TableHead>
          <TableHead>App</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={8} message="No audit events match these filters." />
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-xs">
                {formatDateTime(row.timestamp)}
              </TableCell>
              <TableCell>
                <SeverityBadge severity={row.severity} />
              </TableCell>
              <TableCell>
                <Link
                  href={followLink({ category: row.eventCategory })}
                  aria-label={`Filter to category ${row.eventCategory}`}
                >
                  <Badge variant="muted" className="hover:bg-muted-foreground/20">
                    {row.eventCategory}
                  </Badge>
                </Link>
              </TableCell>
              <TableCell className="max-w-[28rem] truncate">{row.action}</TableCell>
              <TableCell className="text-xs">
                {row.actorEmail ? (
                  <Link
                    href={followLink({ actorEmail: row.actorEmail })}
                    className="hover:text-primary hover:underline"
                    aria-label={`Filter to actor ${row.actorEmail}`}
                  >
                    {row.actorEmail}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">system</span>
                )}
              </TableCell>
              <TableCell className="text-xs">
                {row.customerOrganization?.name || "—"}
              </TableCell>
              <TableCell className="text-xs">
                {row.app?.appKey ? (
                  <Link
                    href={followLink({ appKey: row.app.appKey })}
                    className="font-mono hover:text-primary hover:underline"
                    aria-label={`Filter to app ${row.app.appKey}`}
                  >
                    {row.app.appKey}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                <AuditLogDetailButton row={row} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
