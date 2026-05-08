/**
 * /admin/integrations/github — GitHub integration status. Lists
 * discovered repos + their sync state. Tokens never displayed.
 */

import Link from "next/link";
import { CheckCircle2, AlertTriangle, Code2, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { githubSyncConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function GithubIntegrationPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.INTEGRATIONS_VIEW);
  const enabled = githubSyncConfigured();
  const repos = await prisma.gitRepository.findMany({
    orderBy: { fullName: "asc" },
    include: {
      appLinks: { include: { app: { select: { appKey: true } } } },
    },
  });
  const lastSynced = repos
    .map((r) => r.lastSyncedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="GitHub"
        description="Token configured status, discovered repositories, and webhook setup pointer. Tokens never displayed."
        actions={<LastSyncedStamp at={lastSynced} />}
      />

      <div
        className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
          enabled ? "border-success/30 bg-success/10" : "border-warning/40 bg-warning/10"
        }`}
      >
        {enabled ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        )}
        <div>
          <div className={enabled ? "text-success" : "text-warning"}>
            {enabled ? "Token configured" : "Token not configured"}
          </div>
          <p className="mt-0.5 text-muted-foreground">
            {enabled
              ? "GITHUB_TOKEN is set and ENABLE_GITHUB_SYNC=true. Reconciliation includes the GitHub leg."
              : "Set GITHUB_TOKEN + ENABLE_GITHUB_SYNC=true. Fine-grained PAT scoped to the MacTech-Solutions-LLC + WELCOMETOTHETRIBE orgs is preferred."}
          </p>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Discovered repositories ({repos.length})
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
          {repos.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              {enabled
                ? "Sync hasn't completed yet. Click Sync now on /command-center."
                : "GitHub sync disabled — set GITHUB_TOKEN + ENABLE_GITHUB_SYNC=true."}
            </li>
          ) : null}
          {repos.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
              <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
              <Link
                href={r.htmlUrl ?? `https://github.com/${r.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-primary hover:underline"
              >
                {r.fullName}
                <ExternalLink className="ml-1 inline h-3 w-3" />
              </Link>
              <span className="font-mono text-[11px] text-muted-foreground">
                @{r.latestHeadShortSha ?? "—"} · {r.defaultBranch}
              </span>
              <div className="ml-auto flex flex-wrap gap-1">
                {r.appLinks.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">unmapped</span>
                ) : (
                  r.appLinks.map((l) => (
                    <span
                      key={l.id}
                      className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                    >
                      {l.app.appKey}
                    </span>
                  ))
                )}
              </div>
              {r.lastSyncError ? (
                <span className="font-mono text-[10px] text-destructive">{r.lastSyncError}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border border-border bg-card/40 p-4 text-xs text-muted-foreground">
        <div className="text-sm font-medium text-foreground">Webhook setup</div>
        <p className="mt-2">
          Per-repo webhooks were configured by the deploy script — the URL is
          <span className="ml-1 font-mono">/api/webhooks/github</span> and the secret is
          <span className="ml-1 font-mono">GITHUB_WEBHOOK_SECRET</span>. Webhook deliveries land
          here as IntegrationEvent rows; mismatched signatures audit-log
          <span className="ml-1 font-mono">webhook_rejected</span> with the source IP.
        </p>
      </section>
    </div>
  );
}
