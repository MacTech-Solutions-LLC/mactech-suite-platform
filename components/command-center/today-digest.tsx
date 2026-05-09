/**
 * TodayDigest — Slice 10.
 *
 * The morning page. Renders one "critical right now" strip across the
 * top, then up to seven 24h-activity sections. Sections collapse out
 * when empty so the card stays scannable on a quiet day.
 */

import {
  AlertOctagon,
  ShieldOff,
  XCircle,
  Bot,
  CalendarClock,
  GitCommit,
  Zap,
  Workflow,
  Siren,
  CheckCircle2,
  ArrowRightCircle,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { RunStatusBadge } from "@/components/agents/run-status-badge";
import {
  digestActivityTotal,
  type TodayDigest,
} from "@/lib/services/command-center/today-digest-service";

interface Props {
  digest: TodayDigest;
}

export function TodayDigestCard({ digest }: Props) {
  const total = digestActivityTotal(digest);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card/40 p-4 md:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">
            Today
          </h2>
          <span className="text-xs text-muted-foreground">
            · last {digest.windowHours}h
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {total === 0 ? "quiet" : `${total} signals`}
        </span>
      </div>

      <CriticalNowStrip critical={digest.criticalNow} />

      {total === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No deploys, commits, workflow failures, risks, or agent runs in the last
          24h. Quiet windows are good — that&rsquo;s the goal.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Section
            Icon={Zap}
            title="Deploys"
            count={digest.deploys.length}
            empty="no deploys"
          >
            {digest.deploys.map((d) => (
              <li key={d.id} className="flex items-start gap-2 py-1.5">
                <DeployStatusDot status={d.railwayStatus} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="truncate font-medium">
                      {d.appName ?? d.appKey ?? "?"}
                    </span>
                    {d.appKey && d.appName ? (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {d.appKey}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{d.railwayStatus}</span>
                    {d.productionDriftStatus !== "in_sync" ? (
                      <>
                        <span>·</span>
                        <span className="text-warning">
                          drift: {d.productionDriftStatus}
                        </span>
                      </>
                    ) : null}
                    {d.liveCommitShortSha ? (
                      <>
                        <span>·</span>
                        <span className="font-mono">{d.liveCommitShortSha}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {timeAgo(d.checkedAt)}
                </span>
              </li>
            ))}
          </Section>

          <Section
            Icon={GitCommit}
            title="Commits"
            count={digest.commits.length}
            empty="no commits"
          >
            {digest.commits.map((c) => (
              <li key={c.id} className="flex items-start gap-2 py-1.5">
                <GitCommit className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="truncate font-medium">
                      {firstLine(c.message)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">{c.shortSha}</span>
                    <span>·</span>
                    <span>{c.repoFullName}</span>
                    {c.authorName ? (
                      <>
                        <span>·</span>
                        <span>{c.authorName}</span>
                      </>
                    ) : null}
                    {c.riskFlags.length > 0 ? (
                      <Badge variant="warning" className="ml-1">
                        {c.riskFlags.length} risk
                      </Badge>
                    ) : null}
                  </div>
                </div>
                {c.htmlUrl ? (
                  <a
                    href={c.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="open commit"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </Section>

          <Section
            Icon={Workflow}
            title="Failed workflows"
            count={digest.failedWorkflows.length}
            empty="all green"
          >
            {digest.failedWorkflows.map((w) => (
              <li key={w.id} className="flex items-start gap-2 py-1.5">
                <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{w.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{w.repoFullName}</span>
                    <span>·</span>
                    <span>{w.conclusion ?? "unknown"}</span>
                  </div>
                </div>
                {w.htmlUrl ? (
                  <a
                    href={w.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="open workflow run"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </Section>

          <Section
            Icon={Siren}
            title="Risks opened"
            count={digest.risksOpened.length}
            empty="no new risks"
          >
            {digest.risksOpened.map((r) => (
              <li key={r.id} className="flex items-start gap-2 py-1.5">
                <SeverityBadge severity={r.severity} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{r.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono uppercase tracking-widest">
                      {r.category}
                    </span>
                    {r.appKey ? (
                      <>
                        <span>·</span>
                        <span className="font-mono">{r.appKey}</span>
                      </>
                    ) : null}
                    <span>·</span>
                    <span>{timeAgo(r.detectedAt)}</span>
                  </div>
                </div>
              </li>
            ))}
          </Section>

          <Section
            Icon={CheckCircle2}
            title="Risks resolved"
            count={digest.risksResolved.length}
            empty="none resolved"
          >
            {digest.risksResolved.map((r) => (
              <li key={r.id} className="flex items-start gap-2 py-1.5">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{r.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono uppercase tracking-widest">
                      {r.category}
                    </span>
                    {r.appKey ? (
                      <>
                        <span>·</span>
                        <span className="font-mono">{r.appKey}</span>
                      </>
                    ) : null}
                    {r.resolvedAt ? (
                      <>
                        <span>·</span>
                        <span>{timeAgo(r.resolvedAt)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </Section>

          <Section
            Icon={Bot}
            title="Agent runs"
            count={digest.agentRuns.length}
            empty="no agent activity"
          >
            {digest.agentRuns.map((a) => (
              <li key={a.id} className="flex items-start gap-2 py-1.5">
                <Bot className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">
                    {firstLine(a.requestText)}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <RunStatusBadge status={a.status} />
                    <span>·</span>
                    <span>{a.requestedByEmail}</span>
                    {a.triggeredByApiKeyName ? (
                      <>
                        <span>·</span>
                        <span className="font-mono">
                          via {a.triggeredByApiKeyName}
                        </span>
                      </>
                    ) : null}
                    <span>·</span>
                    <span>{a.plannedStepCount} steps</span>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {timeAgo(a.completedAt ?? a.createdAt)}
                </span>
              </li>
            ))}
          </Section>

          <Section
            Icon={ArrowRightCircle}
            title="Top noisy traffic"
            count={digest.trafficErrors.length}
            empty="no error traffic"
          >
            {digest.trafficErrors.map((t, i) => (
              <li
                key={`${t.sourceLabel}-${t.targetLabel}-${i}`}
                className="flex items-start gap-2 py-1.5"
              >
                <AlertOctagon className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-xs">
                    <span className="font-mono">{t.sourceLabel}</span>
                    <ArrowRightCircle className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate font-mono">{t.targetLabel}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="text-destructive tabular-nums">
                      {t.errorCount} errors
                    </span>
                    <span>·</span>
                    <span className="tabular-nums">
                      {t.callCount} calls
                    </span>
                    {t.callCount > 0 ? (
                      <>
                        <span>·</span>
                        <span className="tabular-nums">
                          {Math.round((t.errorCount / t.callCount) * 100)}%
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function CriticalNowStrip({
  critical,
}: {
  critical: TodayDigest["criticalNow"];
}) {
  const items = [
    {
      Icon: Siren,
      label: "Critical risks",
      value: critical.openCriticalRisks,
      hot: critical.openCriticalRisks > 0,
    },
    {
      Icon: ShieldOff,
      label: "Apps down",
      value: critical.appsCurrentlyDown,
      hot: critical.appsCurrentlyDown > 0,
    },
    {
      Icon: XCircle,
      label: "Deploys failed (24h)",
      value: critical.failedDeployments24h,
      hot: critical.failedDeployments24h > 0,
    },
    {
      Icon: Bot,
      label: "Agents refused (24h)",
      value: critical.refusedAgentRuns24h,
      hot: critical.refusedAgentRuns24h > 0,
    },
    {
      Icon: AlertOctagon,
      label: "Awaiting approval",
      value: critical.awaitingApproval,
      hot: critical.awaitingApproval > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div
          key={it.label}
          className={
            "flex items-center gap-2 rounded-md border px-3 py-2 " +
            (it.hot
              ? "border-destructive/40 bg-destructive/5"
              : "border-border bg-card/40")
          }
        >
          <it.Icon
            className={
              "h-4 w-4 shrink-0 " +
              (it.hot ? "text-destructive" : "text-muted-foreground")
            }
          />
          <div className="min-w-0 flex-1">
            <div
              className={
                "text-lg font-semibold tabular-nums " +
                (it.hot ? "text-destructive" : "text-foreground")
              }
            >
              {it.value}
            </div>
            <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
              {it.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({
  Icon,
  title,
  count,
  empty,
  children,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground">
            {title}
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {count === 0 ? empty : count}
        </span>
      </div>
      {count === 0 ? null : (
        <ul className="divide-y divide-border/60">{children}</ul>
      )}
    </div>
  );
}

function DeployStatusDot({ status }: { status: string }) {
  const tone =
    status === "failed" || status === "crashed"
      ? "bg-destructive"
      : status === "deploying" || status === "building"
        ? "bg-warning animate-pulse"
        : status === "success" || status === "active"
          ? "bg-success"
          : "bg-muted-foreground";
  return <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone}`} />;
}

function firstLine(s: string): string {
  const idx = s.indexOf("\n");
  return idx === -1 ? s : s.slice(0, idx);
}

function timeAgo(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
