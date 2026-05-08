/**
 * /admin/agents/triggers — list every saved AgentTrigger with cron
 * expression, next/last fire times, last run status, and per-row
 * actions (fire-now, toggle, edit, delete).
 */

import Link from "next/link";
import { Plus, Clock, AlertTriangle, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { listTriggers } from "@/lib/agents/triggers-service";
import { isTriggerStuck } from "@/lib/agents/scheduler";
import { TriggerRowActions } from "@/components/agents/trigger-row-actions";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
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
                <Plus className="mr-1 h-3 w-3" />
                New trigger
              </Link>
            </Button>
          ) : undefined
        }
      />

      {!cronConfigured ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <div className="font-semibold text-warning">CRON_SECRET not configured</div>
            <div className="mt-0.5 text-muted-foreground">
              Triggers will save and can be fired manually, but the
              <code className="mx-1 font-mono">/api/cron/agent-triggers</code>
              tick endpoint refuses every call until the secret is set in env.
              Configure on Railway, then point your scheduler (Railway cron / GitHub Actions)
              at <code className="font-mono">POST /api/cron/agent-triggers</code> every minute
              with <code className="font-mono">Authorization: Bearer $CRON_SECRET</code>.
            </div>
          </div>
        </div>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          {triggers.length} trigger{triggers.length === 1 ? "" : "s"}
        </h2>
        {triggers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <Clock className="mx-auto mb-2 h-4 w-4" />
            No scheduled triggers yet.
            {canManage ? (
              <>
                {" "}
                Create one to fire a saved IBE Intent on a schedule.
              </>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card/40">
            {triggers.map((t) => {
              const stuck = isTriggerStuck(t);
              return (
                <li key={t.id} className="p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/agents/triggers/${t.id}/edit`}
                          className="font-medium hover:underline"
                        >
                          {t.name}
                        </Link>
                        <EnabledBadge enabled={t.enabled} />
                        {stuck ? (
                          <Badge variant="warning">
                            <Lock className="mr-0.5 inline h-3 w-3" />
                            {t.consecutiveFailures} failures
                          </Badge>
                        ) : null}
                        {t.lastRunStatus ? <RunStatusBadge status={t.lastRunStatus} /> : null}
                      </div>
                      {t.description ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t.description}
                        </div>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="font-mono">{t.cronExpression}</span>
                        <span>· tz {t.timezone}</span>
                        <span>
                          · next:{" "}
                          {t.nextFireAt
                            ? new Date(t.nextFireAt).toLocaleString()
                            : "—"}
                        </span>
                        <span>
                          · last:{" "}
                          {t.lastFiredAt
                            ? new Date(t.lastFiredAt).toLocaleString()
                            : "never"}
                        </span>
                        {t.lastRunId ? (
                          <Link
                            href={`/admin/agents/${t.lastRunId}`}
                            className="hover:underline"
                          >
                            · last run
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <TriggerRowActions
                      triggerId={t.id}
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

function RunStatusBadge({ status }: { status: string }) {
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
  return <Badge variant={variant}>last run: {status.replace(/_/g, " ")}</Badge>;
}
