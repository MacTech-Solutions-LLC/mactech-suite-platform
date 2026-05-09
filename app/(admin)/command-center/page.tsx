/**
 * /command-center — the flagship operational surface of MacTech Suite.
 *
 * Read-gated by COMMAND_CENTER_VIEW (mactech_admin / support / auditor /
 * read-only); the Sync now button is hidden for users without the
 * COMMAND_CENTER_MANAGE permission.
 */

import Link from "next/link";
import { Compass } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import { OverviewTiles } from "@/components/command-center/overview-tiles";
import { AppStatusTable } from "@/components/command-center/app-status-table";
import { RiskFeed } from "@/components/command-center/risk-feed";
import { SyncNowButton } from "@/components/command-center/sync-now-button";
import { TodayDigestCard } from "@/components/command-center/today-digest";
import { AskAIPanel } from "@/components/ai/ask-ai-panel";
import { FixUnhealthyBanner } from "@/components/command-center/fix-unhealthy-banner";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  getAppOperationalSnapshots,
  getCommandCenterStatus,
  getOpenRiskFlags,
} from "@/lib/services/command-center/command-center-service";
import { getTodayDigest } from "@/lib/services/command-center/today-digest-service";
import { getFixableUnhealthyApps } from "@/lib/services/command-center/fix-unhealthy-service";
import { emailReady } from "@/lib/services/command-center/ai-ask-service";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const ctx = await requirePlatformPermission(
    PLATFORM_PERMISSIONS.COMMAND_CENTER_VIEW,
  );
  const canManage = ctx.permissions.includes(
    PLATFORM_PERMISSIONS.COMMAND_CENTER_MANAGE,
  );
  const canEmail = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  const canStageAgents = ctx.permissions.includes(PLATFORM_PERMISSIONS.AGENTS_CREATE);

  const [status, snapshots, risks, digest, fixable] = await Promise.all([
    getCommandCenterStatus(),
    getAppOperationalSnapshots(),
    getOpenRiskFlags(20),
    getTodayDigest(),
    getFixableUnhealthyApps(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Command Center"
        description="Single internal control plane for the MacTech ecosystem — identity, app registry, runtime health, deployment drift, repository intelligence, operational risk."
        actions={
          <div className="flex items-center gap-3">
            <LastSyncedStamp at={status.lastReconciliationAt} />
            {canManage ? <SyncNowButton /> : null}
          </div>
        }
      />

      <FixUnhealthyBanner fixable={fixable} canStage={canStageAgents} />

      <section>
        <TodayDigestCard digest={digest} />
      </section>

      <section>
        <AskAIPanel
          contextKey="today_digest"
          canEmail={canEmail}
          emailConfigured={emailReady()}
          presets={[
            "What is the most important thing for me to look at first this morning?",
            "Summarize the last 24h in three bullets a non-technical exec could read.",
            "Draft a status email to leadership covering today's deploys, risks, and incidents.",
            "Are there any patterns across the failed workflows, deploys, and risks that suggest a single root cause?",
          ]}
        />
      </section>

      <section>
        <OverviewTiles status={status} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              MacTech apps
            </h2>
            <span className="text-xs text-muted-foreground">
              {status.totalApps} active · sorted by criticality
            </span>
          </div>
          <AppStatusTable snapshots={snapshots} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Open risks
            </h2>
            <span className="text-xs text-muted-foreground">
              {status.openRiskCount} · {status.criticalRiskCount} high/critical
            </span>
          </div>
          <RiskFeed risks={risks} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card/40 p-4 text-xs text-muted-foreground md:p-5">
        <div className="flex items-center gap-2 text-foreground">
          <Compass className="h-3.5 w-3.5" />
          <span className="text-sm font-medium">About the Command Center</span>
        </div>
        <p className="mt-2 max-w-3xl">
          Command Center is the flagship operational surface of MacTech Suite. It correlates
          the App Registry, runtime health, deployment drift, repository intelligence, agent
          activity, and traffic across the ecosystem into one executive-readable page. The
          &ldquo;Today&rdquo; digest at the top is your morning page: critical right-now state plus
          24h activity across every signal. Ask AI grounded on this digest, or scroll to the
          per-app and per-risk action surfaces below.
        </p>
        <p className="mt-2 max-w-3xl">
          Need a customer-facing surface? The{" "}
          <Link
            href="/admin/public-status"
            className="text-primary underline-offset-2 hover:underline"
          >
            public status page
          </Link>{" "}
          renders a sanitized view of opt-in apps at{" "}
          <Link
            href="/status"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            /status
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
