import Link from "next/link";
import { ExternalLink, GitCommit, Plus, Minus, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommitRowMenu } from "./commit-row-menu";
import type { Prisma } from "@prisma/client";

type CommitWithRepo = Prisma.GitCommitEventGetPayload<{
  include: {
    repo: {
      select: {
        fullName: true;
        owner: true;
        repo: true;
        htmlUrl: true;
        appLinks: { select: { app: { select: { id: true; appKey: true; name: true } } } };
      };
    };
  };
}>;

const RISK_LABELS: Record<string, string> = {
  auth_change: "auth",
  database_change: "schema",
  env_config_change: "env / config",
  security_sensitive_change: "security",
};

export function CommitFeed({ commits }: { commits: CommitWithRepo[] }) {
  if (commits.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No commits indexed yet. Run a reconciliation or wait for a GitHub push webhook delivery.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {commits.map((c) => {
        const flags = Array.isArray(c.riskFlagsJson) ? (c.riskFlagsJson as string[]) : [];
        const sensitive = flags.includes("security_sensitive_change");
        const inner = flags.filter((f) => f !== "security_sensitive_change");
        return (
          <li key={c.id} className="grid gap-2 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-start">
            <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-muted-foreground">
              <GitCommit className="h-3.5 w-3.5" />
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span className="font-medium line-clamp-2">{c.message.split("\n")[0]}</span>
                {sensitive ? (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[hsl(38_92%_60%)]">
                    <ShieldAlert className="h-3 w-3" />
                    sensitive
                  </span>
                ) : null}
                {inner.map((f) => (
                  <span
                    key={f}
                    className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground"
                  >
                    {RISK_LABELS[f] ?? f}
                  </span>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <Link
                  href={c.htmlUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline"
                >
                  {c.shortSha}
                </Link>
                <span>{c.repo.fullName}</span>
                {c.authorEmail ? <span>{c.authorEmail}</span> : null}
                {c.committedAt ? (
                  <span>{new Date(c.committedAt).toLocaleString()}</span>
                ) : null}
                {c.repo.appLinks.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {c.repo.appLinks.map((l) => (
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
            </div>

            <div
              className={cn(
                "flex items-center gap-2 text-[11px] font-mono text-muted-foreground sm:justify-self-end",
              )}
            >
              {c.filesChanged > 0 ? (
                <span>
                  {c.filesChanged} file{c.filesChanged === 1 ? "" : "s"}
                </span>
              ) : null}
              {c.additions > 0 ? (
                <span className="text-[hsl(142_71%_55%)]">
                  <Plus className="inline h-2.5 w-2.5" />
                  {c.additions}
                </span>
              ) : null}
              {c.deletions > 0 ? (
                <span className="text-destructive">
                  <Minus className="inline h-2.5 w-2.5" />
                  {c.deletions}
                </span>
              ) : null}
              <Link
                href={c.htmlUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Open commit on GitHub"
              >
                <ExternalLink className="h-3 w-3" />
              </Link>
              <CommitRowMenu
                shortSha={c.shortSha}
                message={c.message}
                repoFullName={c.repo.fullName}
                repoId={c.gitRepositoryId}
                appLinks={c.repo.appLinks.map((l) => ({
                  id: l.app.id,
                  appKey: l.app.appKey,
                }))}
                flags={flags}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
