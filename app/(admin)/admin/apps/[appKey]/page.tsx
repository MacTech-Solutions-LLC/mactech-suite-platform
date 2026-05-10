/**
 * /admin/apps/[appKey] — investigate page (Slice 7; sprint 50 Vivid pass).
 *
 * The single triage surface for one app: identity + health + deploys
 * + commits + workflow runs + risks + agent runs + dependencies +
 * traffic + open PRs/issues. All sourced via getAppDetail() so the
 * page is one server fetch start to finish.
 *
 * Sprint 50: Vivid skin (own layout.tsx with gradient + spotlight,
 * VividCard for each section, DeployProgressStrip for the latest
 * Railway deploy). Other admin routes are unchanged — the Vivid
 * scope is now dashboard + per-app triage, nothing else.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  ArrowLeft,
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
  Siren,
  XCircle,
} from "lucide-react";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getAppDetail } from "@/lib/services/command-center/app-detail-service";
import { VividCard, VividSectionHeader } from "@/components/vivid/vivid-card";
import { MagneticLink } from "@/components/vivid/magnetic-button";
import { DeployProgressStrip } from "./_components/deploy-progress-strip";

export const dynamic = "force-dynamic";

type BadgeVariant = "destructive" | "success" | "warning" | "muted" | "violet" | "cyan";

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

  const healthTone: BadgeVariant =
    latestHealth?.status === "up"
      ? "success"
      : latestHealth?.status === "degraded"
        ? "warning"
        : latestHealth?.status === "down"
          ? "destructive"
          : "muted";

  return (
    <div className="space-y-6">
      <Link
        href="/admin/app-registry"
        className="inline-flex items-center gap-1.5 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3 hover:text-mt-text-2"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        Back to app registry
      </Link>

      {/* Vivid hero */}
      <header className="relative">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
              <span>App · {a.appKey}</span>
              <span className="opacity-50">·</span>
              <span>{a.criticality.replace(/_/g, "-")}</span>
              <span className="opacity-50">·</span>
              <span>{a.status}</span>
            </div>
            <h1 className="mt-2 font-mt-display text-3xl font-semibold leading-tight tracking-tight text-mt-text md:text-4xl">
              {a.name}
            </h1>
            {a.description ? (
              <p className="mt-1 max-w-2xl text-pretty text-sm text-mt-text-2">
                {a.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {a.publicUrl ? (
              <MagneticLink
                href={a.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-mt-2 border border-mt-cyan/30 bg-mt-cyan/10 px-3 py-1.5 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-cyan hover:bg-mt-cyan/15"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                {labelHost(a.publicUrl)}
              </MagneticLink>
            ) : null}
            {a.repoFullName ? (
              <MagneticLink
                href={`https://github.com/${a.repoFullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-mt-2 border border-mt-violet/30 bg-mt-violet/10 px-3 py-1.5 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-violet hover:bg-mt-violet/15"
              >
                <GitBranch className="h-3 w-3" aria-hidden />
                {a.repoFullName}
              </MagneticLink>
            ) : null}
          </div>
        </div>

        <div
          aria-hidden
          className="mt-6 h-px w-full"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.45) 18%, rgba(124,92,255,0.45) 50%, rgba(255,91,208,0.45) 82%, transparent 100%)",
          }}
        />
      </header>

      {/* Deploy progress strip — Vivid centerpiece of the triage view. */}
      {latestDeploy ? (
        <DeployProgressStrip
          status={latestDeploy.railwayStatus}
          shortSha={latestDeploy.liveCommitShortSha}
          checkedAt={latestDeploy.checkedAt}
          railwayDeploymentId={latestDeploy.railwayDeploymentId}
        />
      ) : null}

      {/* Posture tiles */}
      <div className="grid gap-3 md:grid-cols-4">
        <PostureTile
          Icon={Activity}
          label="Health"
          value={latestHealth?.status ?? "unknown"}
          tone={healthTone}
          subtle={
            detail.health.lastUpAt
              ? `last up ${detail.health.lastUpAt.toLocaleString()}`
              : "no successful probe yet"
          }
        />
        <PostureTile
          Icon={Rocket}
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
              ? `${latestDeploy.liveCommitShortSha} · ${latestDeploy.checkedAt.toLocaleString()}`
              : "no deployments synced"
          }
        />
        <PostureTile
          Icon={Siren}
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
        <PostureTile
          Icon={GitPullRequest}
          label="Open PRs / issues"
          value={
            detail.github.configured
              ? `${detail.github.openPRs.length} / ${detail.github.openIssues.length}`
              : "—"
          }
          tone="violet"
          subtle={
            !detail.github.configured
              ? a.repoFullName
                ? "GitHub sync off"
                : "no repo linked"
              : detail.github.warnings.length > 0
                ? `warning: ${detail.github.warnings.join(", ")}`
                : "from github.com"
          }
        />
      </div>

      {/* Risks section — pull this above everything else when there are critical */}
      {detail.openRisks.length > 0 ? (
        <Section
          title={`Open risks (${detail.openRisks.length})`}
          icon={Siren}
          tone={openCriticalRisks.length > 0 ? "rose" : "amber"}
          actionHref={`/admin/ops/risk?appId=${a.id}`}
          actionLabel="Triage"
        >
          <ul className="divide-y divide-mt-hairline rounded-mt-2 border border-mt-hairline bg-mt-surface-1">
            {detail.openRisks.map((r) => (
              <li key={r.id} className="p-3 text-sm">
                <div className="flex items-center gap-2">
                  <SeverityChip severity={r.severity} />
                  <span className="font-medium">{r.title}</span>
                  <span className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
                    {r.category}
                  </span>
                </div>
                {r.description ? (
                  <div className="mt-0.5 text-xs text-mt-text-3">{r.description}</div>
                ) : null}
                <div className="mt-1 text-[11px] text-mt-text-3">
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
            <ul className="divide-y divide-mt-hairline rounded-mt-2 border border-mt-hairline bg-mt-surface-1">
              {detail.github.openPRs.slice(0, 8).map((pr) => (
                <li key={pr.number} className="p-3 text-sm">
                  <a
                    href={pr.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:underline"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mt-mono text-[11px] text-mt-text-3">
                        #{pr.number}
                      </span>
                      {pr.draft ? <MutedChip>draft</MutedChip> : null}
                      <span className="line-clamp-1 font-medium text-mt-text">{pr.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-mt-text-3">
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
            <ul className="divide-y divide-mt-hairline rounded-mt-2 border border-mt-hairline bg-mt-surface-1">
              {detail.deployments.slice(0, 8).map((d) => (
                <li key={d.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <DeployStatusChip status={d.railwayStatus} />
                    <span className="font-mt-mono text-[11px] text-mt-text-2">
                      {d.liveCommitShortSha ?? "?"}
                    </span>
                    {d.productionDriftStatus !== "in_sync" &&
                    d.productionDriftStatus !== "unknown" ? (
                      <WarnChip>{d.productionDriftStatus}</WarnChip>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-mt-text-3">
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
            <ul className="divide-y divide-mt-hairline rounded-mt-2 border border-mt-hairline bg-mt-surface-1">
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
                        <span className="font-mt-mono text-[11px] text-mt-text-3">
                          {c.shortSha}
                        </span>
                        <span className="line-clamp-1 font-medium text-mt-text">
                          {c.message.split("\n")[0]}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-mt-text-3">
                        <span>{c.authorName ?? "unknown"}</span>
                        {c.committedAt ? (
                          <span>· {new Date(c.committedAt).toLocaleString()}</span>
                        ) : null}
                        {flags.length > 0
                          ? flags.slice(0, 4).map((f) => (
                              <WarnChip key={f}>{f}</WarnChip>
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
            <ul className="divide-y divide-mt-hairline rounded-mt-2 border border-mt-hairline bg-mt-surface-1">
              {detail.workflowRuns.slice(0, 8).map((w) => (
                <li key={w.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <WorkflowConclusionChip conclusion={w.conclusion} status={w.status} />
                    <span className="font-medium">{w.name}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-mt-text-3">
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
            <ul className="divide-y divide-mt-hairline rounded-mt-2 border border-mt-hairline bg-mt-surface-1">
              {detail.traffic.inbound.slice(0, 8).map((t, i) => (
                <li
                  key={`in-${t.sourceLabel}-${i}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{t.sourceLabel}</span>
                    <ArrowRight
                      className="mx-1 inline h-3 w-3 text-mt-text-3"
                      aria-hidden="true"
                    />
                    <span className="text-mt-text-3">{a.name}</span>
                  </div>
                  <div className="text-right text-[11px] text-mt-text-3">
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
            <ul className="divide-y divide-mt-hairline rounded-mt-2 border border-mt-hairline bg-mt-surface-1">
              {detail.traffic.outbound.slice(0, 8).map((t, i) => (
                <li
                  key={`out-${t.targetLabel}-${i}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div>
                    <span className="text-mt-text-3">{a.name}</span>
                    <ArrowRight
                      className="mx-1 inline h-3 w-3 text-mt-text-3"
                      aria-hidden="true"
                    />
                    <span className="font-medium">{t.targetLabel}</span>
                  </div>
                  <div className="text-right text-[11px] text-mt-text-3">
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
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-mt-text-3">
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
                          <span className="ml-2 font-mono text-[10px] text-mt-text-3">
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
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-mt-text-3">
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
                          <span className="ml-2 font-mono text-[10px] text-mt-text-3">
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
            <ul className="divide-y divide-mt-hairline rounded-mt-2 border border-mt-hairline bg-mt-surface-1">
              {detail.recentAgentRuns.map((r) => (
                <li key={r.id} className="p-3 text-sm">
                  <Link href={`/admin/agents/${r.id}`} className="block hover:underline">
                    <div className="flex items-center gap-2">
                      <RunStatusChip status={r.status} />
                      <span className="line-clamp-1 font-medium text-mt-text">{r.requestText}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-mt-text-3">
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
            <ul className="divide-y divide-mt-hairline rounded-mt-2 border border-mt-hairline bg-mt-surface-1">
              {detail.github.openIssues.slice(0, 8).map((issue) => (
                <li key={issue.number} className="p-3 text-sm">
                  <a
                    href={issue.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:underline"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mt-mono text-[11px] text-mt-text-3">
                        #{issue.number}
                      </span>
                      <span className="line-clamp-1 font-medium text-mt-text">{issue.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-mt-text-3">
                      <span>by {issue.authorLogin ?? "unknown"}</span>
                      <span>· updated {new Date(issue.updatedAt).toLocaleDateString()}</span>
                      {issue.labels.slice(0, 3).map((l) => (
                        <MutedChip key={l}>{l}</MutedChip>
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

// ── Helpers ────────────────────────────────────────────────────────

const TONE_TEXT: Record<BadgeVariant, string> = {
  success: "text-mt-lime",
  warning: "text-mt-amber",
  destructive: "text-mt-rose",
  cyan: "text-mt-cyan",
  violet: "text-mt-violet",
  muted: "text-mt-text-3",
};

const TONE_CHIP: Record<BadgeVariant, string> = {
  success: "border-mt-lime/30 bg-mt-lime/10 text-mt-lime",
  warning: "border-mt-amber/30 bg-mt-amber/10 text-mt-amber",
  destructive: "border-mt-rose/30 bg-mt-rose/10 text-mt-rose",
  cyan: "border-mt-cyan/30 bg-mt-cyan/10 text-mt-cyan",
  violet: "border-mt-violet/30 bg-mt-violet/10 text-mt-violet",
  muted: "border-mt-hairline bg-mt-surface-1 text-mt-text-3",
};

function PostureTile(props: {
  Icon: typeof Activity;
  label: string;
  value: string;
  subtle?: string;
  tone: BadgeVariant;
}) {
  const Icon = props.Icon;
  return (
    <div className="rounded-mt-3 border border-mt-hairline bg-mt-surface-1 p-3 backdrop-blur-mt-glass">
      <div className="flex items-center gap-1.5 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
        <Icon className="h-3 w-3" aria-hidden />
        {props.label}
      </div>
      <div className={`mt-1.5 font-mt-display text-base font-semibold ${TONE_TEXT[props.tone]}`}>
        {props.value}
      </div>
      {props.subtle ? (
        <div className="mt-0.5 text-[11px] text-mt-text-3">{props.subtle}</div>
      ) : null}
    </div>
  );
}

function Section(props: {
  title: string;
  icon: typeof Activity;
  tone?: "default" | "cyan" | "violet" | "magenta" | "amber" | "rose";
  actionHref: string;
  actionLabel: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <VividCard tone={props.tone ?? "default"}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-mt-display text-base font-semibold tracking-tight text-mt-text md:text-lg">
            <Icon className="h-3.5 w-3.5 text-mt-text-3" aria-hidden />
            {props.title}
          </h2>
        </div>
        <div className="shrink-0 font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
          {props.external ? (
            <a
              href={props.actionHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-mt-cyan"
            >
              {props.actionLabel}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <Link
              href={props.actionHref}
              className="inline-flex items-center gap-1 hover:text-mt-cyan"
            >
              {props.actionLabel}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
      </div>
      {props.children}
    </VividCard>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  const tone: BadgeVariant =
    severity === "critical"
      ? "destructive"
      : severity === "high"
        ? "warning"
        : severity === "medium"
          ? "violet"
          : "muted";
  return (
    <span
      className={`inline-flex items-center rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TONE_CHIP[tone]}`}
    >
      {severity}
    </span>
  );
}

function DeployStatusChip({ status }: { status: string }) {
  const tone: BadgeVariant =
    status === "success"
      ? "success"
      : status === "failed" || status === "crashed"
        ? "destructive"
        : status === "deploying" || status === "building"
          ? "cyan"
          : "muted";
  return (
    <span
      className={`inline-flex items-center rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TONE_CHIP[tone]}`}
    >
      {status}
    </span>
  );
}

function WorkflowConclusionChip({
  conclusion,
  status,
}: {
  conclusion: string | null;
  status: string;
}) {
  if (conclusion === "success") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TONE_CHIP.success}`}
      >
        <Check className="h-3 w-3" aria-hidden />
        success
      </span>
    );
  }
  if (
    conclusion === "failure" ||
    conclusion === "timed_out" ||
    conclusion === "startup_failure"
  ) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TONE_CHIP.destructive}`}
      >
        <XCircle className="h-3 w-3" aria-hidden />
        {conclusion}
      </span>
    );
  }
  if (conclusion) {
    return (
      <span
        className={`inline-flex items-center rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TONE_CHIP.muted}`}
      >
        {conclusion}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TONE_CHIP.cyan}`}
    >
      {status}
    </span>
  );
}

function RunStatusChip({ status }: { status: string }) {
  const tone: BadgeVariant =
    status === "completed"
      ? "success"
      : status === "failed" || status === "rejected" || status === "cancelled"
        ? "destructive"
        : status === "refused" || status === "awaiting_approval"
          ? "warning"
          : "violet";
  return (
    <span
      className={`inline-flex items-center rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TONE_CHIP[tone]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function MutedChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TONE_CHIP.muted}`}
    >
      {children}
    </span>
  );
}

function WarnChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-mt-1 border px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] ${TONE_CHIP.warning}`}
    >
      {children}
    </span>
  );
}

function labelHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return url;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
