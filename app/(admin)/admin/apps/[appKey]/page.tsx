/**
 * /admin/apps/[appKey] — investigate page (Slice 7).
 *
 * The single triage surface for one app: identity + health + deploys
 * + commits + workflow runs + risks + agent runs + dependencies +
 * traffic + open PRs/issues. All sourced via getAppDetail() so the
 * page is one server fetch start to finish.
 *
 * Links to specialty pages for each section so the operator can drill
 * deeper, but the answer to "what's going on with this app" is right
 * here.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CircleAlert,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Network,
  Rocket,
  ShieldCheck,
  Siren,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getAppDetail } from "@/lib/services/command-center/app-detail-service";

export const dynamic = "force-dynamic";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "outline"
  | "muted";

export default async function AppInvestigatePage({
  params,
}: {
  params: { appKey: string };
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
  const detail = await getAppDetail(params.appKey);
  if (!detail) notFound();

  const a = detail.app;
  const latestHealth = detail.health.history.at(-1);
  const latestDeploy = detail.deployments[0];
  const openCriticalRisks = detail.openRisks.filter(
    (r) => r.severity === "critical",
  );

  return (
    <div className="space-y-6">
      <Link
        href="/admin/app-registry"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to app registry
      </Link>

      <PageHeader
        title={a.name}
        description={a.description ?? `App key: ${a.appKey}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{a.criticality.replace(/_/g, " ")}</Badge>
            <Badge variant={a.status === "active" ? "success" : "muted"}>
              {a.status}
            </Badge>
          </div>
        }
      />

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        {a.publicUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={a.publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" aria-hidden="true" />
              {a.publicUrl}
            </a>
          </Button>
        ) : null}
        {a.repoFullName ? (
          <Button asChild size="sm" variant="outline">
            <a
              href={`https://github.com/${a.repoFullName}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GitBranch className="mr-1 h-3 w-3" aria-hidden="true" />
              {a.repoFullName}
            </a>
          </Button>
        ) : null}
        {a.healthUrl ? (
          <Button asChild size="sm" variant="ghost">
            <a href={a.healthUrl} target="_blank" rel="noopener noreferrer">
              <Activity className="mr-1 h-3 w-3" aria-hidden="true" />
              Health endpoint
            </a>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="ghost">
          <Link href={`/admin/ops/traffic?to=${a.id}`}>
            <Network className="mr-1 h-3 w-3" aria-hidden="true" />
            Traffic →
          </Link>
        </Button>
      </div>

      {/* Posture tiles */}
      <div className="grid gap-3 md:grid-cols-4">
        <Tile
          icon={Activity}
          label="Health"
          value={latestHealth?.status ?? "unknown"}
          tone={
            latestHealth?.status === "up"
              ? "success"
              : latestHealth?.status === "degraded"
                ? "warning"
                : latestHealth?.status === "down"
                  ? "destructive"
                  : "muted"
          }
          subtle={
            detail.health.lastUpAt
              ? `last up ${detail.health.lastUpAt.toLocaleString()}`
              : "no successful probe yet"
          }
        />
        <Tile
          icon={Rocket}
          label="Latest deploy"
          value={latestDeploy?.railwayStatus ?? "no data"}
          tone={
            latestDeploy?.railwayStatus === "success"
              ? "success"
              : latestDeploy?.railwayStatus === "failed" ||
                  latestDeploy?.railwayStatus === "crashed"
                ? "destructive"
                : "muted"
          }
          subtle={
            latestDeploy?.liveCommitShortSha
              ? `commit ${latestDeploy.liveCommitShortSha} · ${latestDeploy.checkedAt.toLocaleString()}`
              : "no deployments synced"
          }
        />
        <Tile
          icon={Siren}
          label="Open risks"
          value={`${detail.openRisks.length}`}
          tone={
            openCriticalRisks.length > 0
              ? "destructive"
              : detail.openRisks.length > 0
                ? "warning"
                : "success"
          }
          subtle={
            openCriticalRisks.length > 0
              ? `${openCriticalRisks.length} critical`
              : detail.openRisks.length === 0
                ? "clear"
                : "none critical"
          }
        />
        <Tile
          icon={GitPullRequest}
          label="Open PRs / issues"
          value={
            detail.github.configured
              ? `${detail.github.openPRs.length} / ${detail.github.openIssues.length}`
              : "—"
          }
          tone="default"
          subtle={
            !detail.github.configured
              ? a.repoFullName
                ? "GitHub sync off"
                : "no repo linked"
              : detail.github.warnings.length > 0
                ? `warning: ${detail.github.warnings.join(", ")}`
                : `from github.com`
          }
        />
      </div>

      {/* Risks section — pull this above everything else when there are critical */}
      {detail.openRisks.length > 0 ? (
        <Section
          title={`Open risks (${detail.openRisks.length})`}
          icon={Siren}
          tone={openCriticalRisks.length > 0 ? "destructive" : "warning"}
          actionHref={`/admin/ops/risk?appId=${a.id}`}
          actionLabel="Triage"
        >
          <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
            {detail.openRisks.map((r) => (
              <li key={r.id} className="p-3 text-sm">
                <div className="flex items-center gap-2">
                  <SeverityChip severity={r.severity} />
                  <span className="font-medium">{r.title}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {r.category}
                  </span>
                </div>
                {r.description ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{r.description}</div>
                ) : null}
                <div className="mt-1 text-[11px] text-muted-foreground">
                  detected {r.detectedAt.toLocaleString()}
                  {r.acknowledgedBy ? ` · acked by ${r.acknowledgedBy}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Two-column body */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* GitHub: PRs */}
        {detail.github.configured && detail.github.openPRs.length > 0 ? (
          <Section
            title={`Open pull requests (${detail.github.openPRs.length})`}
            icon={GitPullRequest}
            actionHref={`https://github.com/${detail.github.repoFullName}/pulls`}
            actionLabel="GitHub"
            external
          >
            <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
              {detail.github.openPRs.slice(0, 8).map((pr) => (
                <li key={pr.number} className="p-3 text-sm">
                  <a
                    href={pr.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:underline"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        #{pr.number}
                      </span>
                      {pr.draft ? <Badge variant="muted">draft</Badge> : null}
                      <span className="line-clamp-1 font-medium">{pr.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span>by {pr.authorLogin ?? "unknown"}</span>
                      <span>· {pr.baseBranch} ← {pr.headBranch}</span>
                      <span>· updated {new Date(pr.updatedAt).toLocaleDateString()}</span>
                      {pr.commentCount > 0 ? (
                        <span>
                          <MessageSquare className="mr-0.5 inline h-3 w-3" /> {pr.commentCount}
                        </span>
                      ) : null}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Recent deploys */}
        {detail.deployments.length > 0 ? (
          <Section
            title={`Recent deploys (${detail.deployments.length})`}
            icon={Rocket}
            actionHref={`/admin/ops/ecosystem`}
            actionLabel="Ecosystem"
          >
            <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
              {detail.deployments.slice(0, 8).map((d) => (
                <li key={d.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <DeployStatusChip status={d.railwayStatus} />
                    <span className="font-mono text-[11px]">
                      {d.liveCommitShortSha ?? "?"}
                    </span>
                    {d.productionDriftStatus !== "in_sync" &&
                    d.productionDriftStatus !== "unknown" ? (
                      <Badge variant="warning">{d.productionDriftStatus}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {d.checkedAt.toLocaleString()}
                    {d.commitsBehind != null && d.commitsBehind > 0
                      ? ` · ${d.commitsBehind} commits behind main`
                      : ""}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Recent commits */}
        {detail.recentCommits.length > 0 ? (
          <Section
            title={`Recent commits (${detail.recentCommits.length})`}
            icon={GitCommit}
            actionHref={`/admin/repositories/commits`}
            actionLabel="All commits"
          >
            <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
              {detail.recentCommits.slice(0, 10).map((c) => {
                const flags = Array.isArray(c.riskFlagsJson)
                  ? (c.riskFlagsJson as string[])
                  : [];
                return (
                  <li key={c.id} className="p-3 text-sm">
                    <a
                      href={c.htmlUrl ?? "#"}
                      target={c.htmlUrl ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="block hover:underline"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {c.shortSha}
                        </span>
                        <span className="line-clamp-1 font-medium">
                          {c.message.split("\n")[0]}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{c.authorName ?? "unknown"}</span>
                        {c.committedAt ? (
                          <span>· {new Date(c.committedAt).toLocaleString()}</span>
                        ) : null}
                        {flags.length > 0
                          ? flags.slice(0, 4).map((f) => (
                              <Badge key={f} variant="warning">
                                {f}
                              </Badge>
                            ))
                          : null}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {/* Workflow runs */}
        {detail.workflowRuns.length > 0 ? (
          <Section
            title={`Workflow runs (${detail.workflowRuns.length})`}
            icon={Activity}
            actionHref={`/admin/repositories/workflow-runs`}
            actionLabel="All runs"
          >
            <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
              {detail.workflowRuns.slice(0, 8).map((w) => (
                <li key={w.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <WorkflowConclusionChip conclusion={w.conclusion} status={w.status} />
                    <span className="font-medium">{w.name}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {w.startedAt ? new Date(w.startedAt).toLocaleString() : "—"}
                    {w.htmlUrl ? (
                      <>
                        {" · "}
                        <a
                          href={w.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          GitHub →
                        </a>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Traffic — inbound */}
        {detail.traffic.inbound.length > 0 ? (
          <Section
            title={`Inbound traffic (${detail.traffic.windowHours}h)`}
            icon={Network}
            actionHref={`/admin/ops/traffic?to=${a.id}`}
            actionLabel="Full log"
          >
            <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
              {detail.traffic.inbound.slice(0, 8).map((t, i) => (
                <li
                  key={`in-${t.sourceLabel}-${i}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{t.sourceLabel}</span>
                    <ArrowRight
                      className="mx-1 inline h-3 w-3 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">{a.name}</span>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground">
                    <div>
                      {t.callCount} call{t.callCount === 1 ? "" : "s"}
                      {t.errorCount > 0 ? (
                        <span className="ml-1 text-destructive">· {t.errorCount} err</span>
                      ) : null}
                    </div>
                    <div className="font-mono">{formatBytes(t.bytesIn)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Traffic — outbound */}
        {detail.traffic.outbound.length > 0 ? (
          <Section
            title={`Outbound traffic (${detail.traffic.windowHours}h)`}
            icon={Network}
            actionHref={`/admin/ops/traffic?from=${a.appKey}`}
            actionLabel="Full log"
          >
            <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
              {detail.traffic.outbound.slice(0, 8).map((t, i) => (
                <li
                  key={`out-${t.targetLabel}-${i}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div>
                    <span className="text-muted-foreground">{a.name}</span>
                    <ArrowRight
                      className="mx-1 inline h-3 w-3 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="font-medium">{t.targetLabel}</span>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground">
                    <div>
                      {t.callCount} call{t.callCount === 1 ? "" : "s"}
                      {t.errorCount > 0 ? (
                        <span className="ml-1 text-destructive">· {t.errorCount} err</span>
                      ) : null}
                    </div>
                    <div className="font-mono">{formatBytes(t.bytesIn)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Dependencies */}
        {detail.dependencies.outgoing.length > 0 ||
        detail.dependencies.incoming.length > 0 ? (
          <Section
            title={`Dependencies (${detail.dependencies.outgoing.length}↗ / ${detail.dependencies.incoming.length}↘)`}
            icon={Network}
            actionHref="/admin/ops/ecosystem"
            actionLabel="Graph"
          >
            <div className="grid gap-3">
              {detail.dependencies.outgoing.length > 0 ? (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {a.appKey} depends on:
                  </div>
                  <ul className="space-y-0.5">
                    {detail.dependencies.outgoing.map((d) => (
                      <li key={d.id} className="text-xs">
                        <Link
                          href={`/admin/apps/${d.target.appKey}`}
                          className="hover:underline"
                        >
                          <span className="font-medium">{d.target.name}</span>
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {d.dependencyType}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {detail.dependencies.incoming.length > 0 ? (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    Depends on {a.appKey}:
                  </div>
                  <ul className="space-y-0.5">
                    {detail.dependencies.incoming.map((d) => (
                      <li key={d.id} className="text-xs">
                        <Link
                          href={`/admin/apps/${d.source.appKey}`}
                          className="hover:underline"
                        >
                          <span className="font-medium">{d.source.name}</span>
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {d.dependencyType}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {/* Recent agent runs */}
        {detail.recentAgentRuns.length > 0 ? (
          <Section
            title={`Recent agent runs (${detail.recentAgentRuns.length})`}
            icon={Bot}
            actionHref="/admin/agents"
            actionLabel="All runs"
          >
            <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
              {detail.recentAgentRuns.map((r) => (
                <li key={r.id} className="p-3 text-sm">
                  <Link href={`/admin/agents/${r.id}`} className="block hover:underline">
                    <div className="flex items-center gap-2">
                      <RunStatusChip status={r.status} />
                      <span className="line-clamp-1 font-medium">{r.requestText}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {r.requestedByEmail} · {r.plannedStepCount} step
                      {r.plannedStepCount === 1 ? "" : "s"} ·{" "}
                      {r.createdAt.toLocaleString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* GitHub: issues */}
        {detail.github.configured && detail.github.openIssues.length > 0 ? (
          <Section
            title={`Open issues (${detail.github.openIssues.length})`}
            icon={CircleAlert}
            actionHref={`https://github.com/${detail.github.repoFullName}/issues`}
            actionLabel="GitHub"
            external
          >
            <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
              {detail.github.openIssues.slice(0, 8).map((issue) => (
                <li key={issue.number} className="p-3 text-sm">
                  <a
                    href={issue.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:underline"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        #{issue.number}
                      </span>
                      <span className="line-clamp-1 font-medium">{issue.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>by {issue.authorLogin ?? "unknown"}</span>
                      <span>· updated {new Date(issue.updatedAt).toLocaleDateString()}</span>
                      {issue.labels.slice(0, 3).map((l) => (
                        <Badge key={l} variant="muted">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Tile(props: {
  icon: typeof Activity;
  label: string;
  value: string;
  subtle?: string;
  tone: BadgeVariant;
}) {
  const Icon = props.icon;
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    default: "text-primary",
    secondary: "text-foreground",
    muted: "text-muted-foreground",
    outline: "text-foreground",
  }[props.tone] as string;
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {props.label}
      </div>
      <div className={`mt-1 text-base font-semibold ${toneClass}`}>{props.value}</div>
      {props.subtle ? (
        <div className="text-[11px] text-muted-foreground">{props.subtle}</div>
      ) : null}
    </div>
  );
}

function Section(props: {
  title: string;
  icon: typeof Activity;
  tone?: "default" | "warning" | "destructive";
  actionHref: string;
  actionLabel: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section
      className={`rounded-lg border ${
        props.tone === "destructive"
          ? "border-destructive/40 bg-destructive/5"
          : props.tone === "warning"
            ? "border-warning/40 bg-warning/5"
            : "border-border bg-transparent"
      } p-3`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3 w-3" aria-hidden="true" />
          {props.title}
        </h2>
        <Button asChild size="sm" variant="ghost">
          {props.external ? (
            <a href={props.actionHref} target="_blank" rel="noopener noreferrer">
              {props.actionLabel}
              <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
            </a>
          ) : (
            <Link href={props.actionHref}>
              {props.actionLabel} <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </Button>
      </div>
      {props.children}
    </section>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  const variant: BadgeVariant = (() => {
    switch (severity) {
      case "critical":
        return "destructive";
      case "high":
        return "warning";
      case "medium":
        return "secondary";
      default:
        return "muted";
    }
  })();
  return <Badge variant={variant}>{severity}</Badge>;
}

function DeployStatusChip({ status }: { status: string }) {
  const variant: BadgeVariant =
    status === "success"
      ? "success"
      : status === "failed" || status === "crashed"
        ? "destructive"
        : status === "deploying" || status === "building"
          ? "default"
          : "muted";
  return <Badge variant={variant}>{status}</Badge>;
}

function WorkflowConclusionChip({
  conclusion,
  status,
}: {
  conclusion: string | null;
  status: string;
}) {
  if (conclusion === "success") return <Badge variant="success"><Check className="mr-0.5 inline h-3 w-3" />success</Badge>;
  if (
    conclusion === "failure" ||
    conclusion === "timed_out" ||
    conclusion === "startup_failure"
  )
    return <Badge variant="destructive"><XCircle className="mr-0.5 inline h-3 w-3" />{conclusion}</Badge>;
  if (conclusion) return <Badge variant="muted">{conclusion}</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

function RunStatusChip({ status }: { status: string }) {
  const variant: BadgeVariant = (() => {
    switch (status) {
      case "completed":
        return "success";
      case "failed":
      case "rejected":
      case "cancelled":
        return "destructive";
      case "refused":
      case "awaiting_approval":
        return "warning";
      default:
        return "secondary";
    }
  })();
  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
