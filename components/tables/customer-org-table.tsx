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
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

export interface CustomerOrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscriptionTier: string;
  cmmcTargetLevel: string;
  customerType: string;
  domain: string | null;
  cageCode: string | null;
  enabledAppKeys: string[];
  totalUsers: number;
}

export function CustomerOrgTable({ rows }: { rows: CustomerOrgRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Tier</TableHead>
          <TableHead>CMMC</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="min-w-[14rem]">Apps enabled</TableHead>
          <TableHead>Users</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={8} message="No customer organizations match these filters." />
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link
                  href={`/admin/customer-orgs/${row.id}`}
                  className="font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {row.domain || `/${row.slug}`}
                  {row.cageCode && ` · CAGE ${row.cageCode}`}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                <Badge variant="outline">{row.subscriptionTier}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="muted">{row.cmmcTargetLevel}</Badge>
              </TableCell>
              <TableCell className="text-xs capitalize">{row.customerType}</TableCell>
              <TableCell>
                {row.enabledAppKeys.length === 0 ? (
                  <Link
                    href={`/admin/customer-orgs/${row.id}/entitlements`}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    none — click to enable
                  </Link>
                ) : (
                  <Link
                    href={`/admin/customer-orgs/${row.id}/entitlements`}
                    className="flex flex-wrap gap-1 hover:opacity-80"
                  >
                    {row.enabledAppKeys.slice(0, 4).map((key) => (
                      <Badge
                        key={key}
                        variant="success"
                        className="font-mono text-[10px]"
                      >
                        {key}
                      </Badge>
                    ))}
                    {row.enabledAppKeys.length > 4 && (
                      <Badge variant="muted" className="text-[10px]">
                        +{row.enabledAppKeys.length - 4}
                      </Badge>
                    )}
                  </Link>
                )}
              </TableCell>
              <TableCell>{row.totalUsers}</TableCell>
              <TableCell>
                <Link
                  href={`/admin/customer-orgs/${row.id}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
