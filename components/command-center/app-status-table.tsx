import Link from "next/link";
import { ExternalLink, Code2 } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { RiskBadge } from "@/components/ui/risk-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppOperationalSnapshot } from "@/lib/services/command-center/command-center-service";

const CRITICALITY_TONE: Record<string, string> = {
  mission_critical: "text-destructive font-semibold",
  high: "text-warning",
  medium: "text-foreground",
  low: "text-muted-foreground",
};

export function AppStatusTable({ snapshots }: { snapshots: AppOperationalSnapshot[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>App</TableHead>
            <TableHead>Health</TableHead>
            <TableHead>Latency</TableHead>
            <TableHead>Public URL</TableHead>
            <TableHead>Repo</TableHead>
            <TableHead>Criticality</TableHead>
            <TableHead className="text-right">Risks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {snapshots.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                No active apps in the registry yet. Run the seed or add rows in /admin/app-registry.
              </TableCell>
            </TableRow>
          ) : null}
          {snapshots.map((s) => {
            const a = s.app;
            const health = s.latestHealth?.status ?? "unknown";
            const latency = s.latestHealth?.latencyMs;
            return (
              <TableRow key={a.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{a.name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {a.appKey}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusPill status={health} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {latency !== null && latency !== undefined ? `${latency} ms` : "—"}
                </TableCell>
                <TableCell>
                  {a.publicUrl ? (
                    <Link
                      href={a.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {prettyHost(a.publicUrl)}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {a.repoFullName ? (
                    <a
                      href={`https://github.com/${a.repoFullName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                    >
                      <Code2 className="h-3 w-3" />
                      {a.repoFullName}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell
                  className={`text-xs uppercase tracking-widest ${
                    CRITICALITY_TONE[a.criticality] ?? "text-foreground"
                  }`}
                >
                  {a.criticality.replace(/_/g, " ")}
                </TableCell>
                <TableCell className="text-right">
                  {s.openRisks.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-xs">{s.openRisks.length}</span>
                      {s.openRisks[0] ? <RiskBadge severity={s.openRisks[0].severity} /> : null}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function prettyHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
