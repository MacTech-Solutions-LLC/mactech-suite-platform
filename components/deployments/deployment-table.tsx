import Link from "next/link";
import { ExternalLink, Rocket } from "lucide-react";
import { DeploymentStatusPill } from "./deployment-status-pill";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DeploymentSnapshotRow } from "@/lib/services/command-center/deployment-intelligence-service";

export function DeploymentTable({ rows }: { rows: DeploymentSnapshotRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No Railway resources tracked yet. Set <span className="font-mono">RAILWAY_API_TOKEN</span> +
        <span className="font-mono"> ENABLE_RAILWAY_SYNC=true</span>; the next reconciliation
        populates this from every AppRegistry row that has Railway IDs.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service / environment</TableHead>
            <TableHead>App</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Live SHA</TableHead>
            <TableHead>Last successful</TableHead>
            <TableHead className="text-right">Last sync</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const r = row.resource;
            const lastSuccess = row.lastSuccessfulCheckAt;
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <Link
                      href={r.railwayDashboardUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      <Rocket className="h-3.5 w-3.5" />
                      {r.serviceName ?? r.serviceId}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </Link>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {r.projectName ?? r.projectId} · {r.environmentName ?? r.environmentId}
                    </span>
                    {r.lastSyncError ? (
                      <span className="mt-0.5 font-mono text-[10px] text-destructive">
                        sync error: {r.lastSyncError}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {row.app ? (
                    <span className="font-mono text-[10px] uppercase tracking-widest">
                      {row.app.appKey}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">unmapped</span>
                  )}
                </TableCell>
                <TableCell>
                  <DeploymentStatusPill status={row.latestSnapshot?.railwayStatus ?? "unknown"} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.latestSnapshot?.liveCommitShortSha ?? "—"}
                  {row.latestSnapshot?.liveBranch ? (
                    <span className="ml-2 rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-widest">
                      {row.latestSnapshot.liveBranch}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {lastSuccess ? new Date(lastSuccess).toLocaleString() : "never observed"}
                </TableCell>
                <TableCell className="text-right">
                  <LastSyncedStamp at={r.lastSyncedAt ?? undefined} prefix="synced" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
