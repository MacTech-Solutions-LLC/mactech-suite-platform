import Link from "next/link";
import { ExternalLink, Code2 } from "lucide-react";
import { DriftBadge } from "./drift-badge";
import { WorkflowStatusPill } from "./workflow-status-pill";
import { RepoSyncButton } from "./repo-sync-button";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RepositorySnapshotRow } from "@/lib/services/command-center/repo-intelligence-service";

export function RepoStatusTable({ rows }: { rows: RepositorySnapshotRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No repositories tracked yet. Sync runs once you set <span className="font-mono">GITHUB_TOKEN</span> +
        <span className="font-mono"> ENABLE_GITHUB_SYNC=true</span>; the first reconciliation will populate this from
        every AppRegistry row that has a <span className="font-mono">repoFullName</span>.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Repository</TableHead>
            <TableHead>Apps</TableHead>
            <TableHead>Default branch</TableHead>
            <TableHead>HEAD</TableHead>
            <TableHead>Drift</TableHead>
            <TableHead>Latest workflow</TableHead>
            <TableHead className="text-right">Last sync</TableHead>
            <TableHead className="w-32 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => {
            const r = s.repo;
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <a
                    href={r.htmlUrl ?? `https://github.com/${r.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-sm text-primary hover:underline"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    {r.fullName}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {r.lastSyncError ? (
                    <div className="mt-0.5 text-[11px] text-destructive font-mono">
                      sync error: {r.lastSyncError}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {s.apps.length === 0 ? (
                      <span className="text-xs text-muted-foreground">unmapped</span>
                    ) : (
                      s.apps.map((a) => (
                        <span
                          key={a.id}
                          className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest"
                        >
                          {a.appKey}
                        </span>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.defaultBranch}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.latestHeadShortSha ?? "—"}
                </TableCell>
                <TableCell>
                  {/* Drift here is a coarse "is the latest commit on the
                      default branch what's deployed?" rendering. The
                      actual production-behind-main flag opens via the
                      risk evaluator when liveCommitSha < HEAD. */}
                  <DriftBadge
                    liveSha={s.latestCommit?.sha ?? null}
                    headSha={r.latestHeadSha}
                    commitsBehind={r.latestHeadSha === s.latestCommit?.sha ? 0 : null}
                  />
                </TableCell>
                <TableCell>
                  {s.latestWorkflow ? (
                    <Link
                      href={s.latestWorkflow.htmlUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2"
                    >
                      <WorkflowStatusPill
                        status={s.latestWorkflow.status}
                        conclusion={s.latestWorkflow.conclusion}
                      />
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {s.latestWorkflow.name}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">none observed</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <LastSyncedStamp at={r.lastSyncedAt ?? undefined} prefix="synced" />
                </TableCell>
                <TableCell className="text-right">
                  <RepoSyncButton fullName={r.fullName} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
