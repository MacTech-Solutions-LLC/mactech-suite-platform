import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { initialsFor, relativeTime } from "@/lib/utils";

export interface UserRow {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  status: string;
  lastSeenAt: Date | null;
  permissions?: number;
  isInternal?: boolean;
  platformRole?: string;
}

export function UserTable({ rows, kind }: { rows: UserRow[]; kind: "platform" | "org" }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>{kind === "platform" ? "Platform role" : "Org role"}</TableHead>
          {kind === "org" && <TableHead>Permissions</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead>Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={kind === "org" ? 5 : 4} message="No users to display." />
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                    {initialsFor(row.name, row.email)}
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-medium">{row.name || row.email}</div>
                    <div className="text-xs text-muted-foreground">{row.email}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{row.role}</Badge>
                {row.isInternal && (
                  <Badge variant="default" className="ml-2">
                    Internal
                  </Badge>
                )}
              </TableCell>
              {kind === "org" && (
                <TableCell>
                  <Badge variant="muted">{row.permissions ?? 0} perms</Badge>
                </TableCell>
              )}
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {relativeTime(row.lastSeenAt)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
