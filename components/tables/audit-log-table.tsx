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
                <Badge variant="muted">{row.eventCategory}</Badge>
              </TableCell>
              <TableCell className="max-w-[28rem] truncate">{row.action}</TableCell>
              <TableCell className="text-xs">{row.actorEmail || "system"}</TableCell>
              <TableCell className="text-xs">
                {row.customerOrganization?.name || "—"}
              </TableCell>
              <TableCell className="text-xs">{row.app?.appKey || "—"}</TableCell>
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
