import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { WorkflowStatusPill } from "./workflow-status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";

type RunWithRepo = Prisma.GitWorkflowRunGetPayload<{
  include: {
    repo: {
      select: {
        fullName: true;
        appLinks: { select: { app: { select: { id: true; appKey: true; name: true } } } };
      };
    };
  };
}>;

export function WorkflowRunTable({ runs }: { runs: RunWithRepo[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No workflow runs indexed yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead>Repo / app</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead className="text-right">Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link
                  href={r.htmlUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium hover:underline"
                >
                  {r.name}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Link>
                <div className="text-[11px] text-muted-foreground">{r.event}</div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-mono text-xs">{r.repo.fullName}</span>
                  {r.repo.appLinks.length > 0 ? (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {r.repo.appLinks.map((l) => (
                        <span
                          key={l.app.id}
                          className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest"
                        >
                          {l.app.appKey}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {r.branch ?? "—"}
              </TableCell>
              <TableCell>
                <WorkflowStatusPill status={r.status} conclusion={r.conclusion} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                {r.durationMs !== null ? `${Math.round(r.durationMs / 1000)}s` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
