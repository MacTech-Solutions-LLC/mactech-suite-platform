/**
 * /admin/agents/triggers — list every saved AgentTrigger with cron
 * expression, next/last fire times, last run status, and per-row
 * actions (fire-now, toggle, edit, delete).
 */

import Link from "next/link";
import { Plus, Clock, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { listTriggers } from "@/lib/agents/triggers-service";
import { isTriggerStuck } from "@/lib/agents/scheduler";
import { TriggerRowActions } from "@/components/agents/trigger-row-actions";
import { RunStatusBadge } from "@/components/agents/run-status-badge";
import { AgentEmptyState } from "@/components/agents/empty-state";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "refused"
  | "outline"
  | "muted";

export default async function TriggersPage() {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_VIEW);
  const canManage = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  const triggers = await listTriggers();
  const cronConfigured = Boolean(env.CRON_SECRET);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduled triggers"
        description="Saved IBE-gated Intents that fire on cron. Each fire goes through the same approval gate as a browser-driven run; read-only plans auto-execute, writes queue in awaiting_approval. Synthetic requester identity (cron:<id>) preserves separation of duties."
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link href="/admin/agents/triggers/new">
                <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                New trigger
              </Link>
            </Button>
          ) : undefined
        }
      />

      {!cronConfigured ? (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>CRON_SECRET not configured</AlertTitle>
          <AlertDescription>
            Triggers will save and can be fired manually, but the{" "}
            <code className="mx-0.5 font-mono text-[11px]">
              /api/cron/agent-triggers
            </code>{" "}
            tick endpoint refuses every call until the secret is set in env.
            Configure on Railway, then point your scheduler (Railway cron /
            GitHub Actions) at{" "}
            <code className="font-mono text-[11px]">
              POST /api/cron/agent-triggers
            </code>{" "}
            every minute with{" "}
            <code className="font-mono text-[11px]">
              Authorization: Bearer $CRON_SECRET
            </code>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {triggers.length} trigger{triggers.length === 1 ? "" : "s"}
        </h2>
        {triggers.length === 0 ? (
          <AgentEmptyState
            icon={Clock}
            title="No scheduled triggers yet"
            body="Create one to fire a saved IBE Intent on a schedule. Read-only plans auto-execute; writes queue for human approval."
            action={
              canManage ? (
                <Button asChild size="sm">
                  <Link href="/admin/agents/triggers/new">
                    <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                    New trigger
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
            {triggers.map((t) => {
              const stuck = isTriggerStuck(t);
              return (
                <li key={t.id} className="p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/agents/triggers/${t.id}/edit`}
                          className="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          {t.name}
                        </Link>
                        <EnabledBadge enabled={t.enabled} />
                        {stuck ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            stuck — {t.consecutiveFailures} failures
                          </Badge>
                        ) : null}
                        {t.lastRunStatus ? (
                          <RunStatusBadge
                            status={t.lastRunStatus}
                            prefix="last run: "
                          />
                        ) : null}
                      </div>
                      {t.description ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t.description}
                        </div>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        {t.kind === "cron" ? (
                          <>
                            <Badge variant="muted">cron</Badge>
                            <span className="font-mono">
                              {t.cronExpression ?? "?"}
                            </span>
                            <span>· tz {t.timezone}</span>
                            <span>
                              · next:{" "}
                              {t.nextFireAt
                                ? new Date(t.nextFireAt).toLocaleString()
                                : "—"}
                            </span>
                          </>
                        ) : (
                          <>
                            <Badge variant="default">threshold</Badge>
                            <span className="font-mono">
                              {t.thresholdMetric ?? "?"} {t.thresholdOperator ?? "?"}{" "}
                              {t.thresholdValue ?? "?"}
                            </span>
                            <span>
                              · last value:{" "}
                              <span className="font-mono">
                                {t.thresholdLastValue != null
                                  ? t.thresholdLastValue
                                  : "(not yet evaluated)"}
                              </span>
                            </span>
                            {t.thresholdConditionMet ? (
                              <Badge variant="warning">condition true</Badge>
                            ) : null}
                            <span>· cooldown {t.cooldownMinutes}m</span>
                          </>
                        )}
                        <span>
                          · last fired:{" "}
                          {t.lastFiredAt
                            ? new Date(t.lastFiredAt).toLocaleString()
                            : "never"}
                        </span>
                        {t.lastRunId ? (
                          <Link
                            href={`/admin/agents/${t.lastRunId}`}
                            className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            · last run
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <TriggerRowActions
                      triggerId={t.id}
                      triggerName={t.name}
                      enabled={t.enabled}
                      canManage={canManage}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  const variant: BadgeVariant = enabled ? "success" : "muted";
  return <Badge variant={variant}>{enabled ? "enabled" : "disabled"}</Badge>;
}
