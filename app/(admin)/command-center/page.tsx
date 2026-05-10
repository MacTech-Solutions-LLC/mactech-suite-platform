/**
 * /command-center — the flagship operational surface of MacTech Suite.
 *
 * Read-gated by COMMAND_CENTER_VIEW (mactech_admin / support / auditor /
 * read-only); the Sync now button is hidden for users without the
 * COMMAND_CENTER_MANAGE permission.
 *
 * Sprint 44: visual layer rebuilt on the "Vivid" system — see
 * docs/COMMAND_CENTER_UI.md and the sibling `_components/`. The route
 * has its own scoped layout (radial gradient + cursor spotlight) so
 * the aesthetic stays inside this URL prefix.
 */

import Link from "next/link";
import { Compass } from "lucide-react";
import { LastSyncedStamp } from "@/components/ui/last-synced-stamp";
import { OverviewTiles } from "@/components/command-center/overview-tiles";
import { AppStatusTable } from "@/components/command-center/app-status-table";
import { RiskFeed } from "@/components/command-center/risk-feed";
import { SyncNowButton } from "@/components/command-center/sync-now-button";
import { TodayDigestCard } from "@/components/command-center/today-digest";
import { AskAIPanel } from "@/components/ai/ask-ai-panel";
import { FixUnhealthyBanner } from "@/components/command-center/fix-unhealthy-banner";
import { AwaitingApprovalStrip } from "@/components/command-center/awaiting-approval-strip";
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
import { CCHero } from "./_components/cc-hero";
import { VividCard, VividSectionHeader } from "./_components/vivid-card";

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
  const canApproveAgents = ctx.permissions.includes(
    PLATFORM_PERMISSIONS.AGENTS_APPROVE,
  );

  const [status, snapshots, risks, digest, fixable] = await Promise.all([
    getCommandCenterStatus(),
    getAppOperationalSnapshots(),
    getOpenRiskFlags(20),
    getTodayDigest(),
    getFixableUnhealthyApps(),
  ]);

  return (
    <div className="space-y-8">
      <CCHero
        eyebrow="MacTech Suite · Command Center"
        titlePrefix="One sign-in,"
        titleEmphasis="every app,"
        titleSuffix="full audit trail."
        tagline="Single internal control plane for the MacTech ecosystem — identity, app registry, runtime health, deployment drift, repository intelligence, and operational risk, correlated into one executive-readable page."
        actions={
          <div className="flex items-center gap-3 rounded-mt-2 border border-mt-hairline bg-mt-surface-1 px-3 py-1.5 backdrop-blur-mt-glass">
            <LastSyncedStamp at={status.lastReconciliationAt} />
            {canManage ? <SyncNowButton /> : null}
          </div>
        }
      />

      <FixUnhealthyBanner fixable={fixable} canStage={canStageAgents} />

      <AwaitingApprovalStrip
        runs={digest.awaitingApprovalRuns}
        viewerClerkUserId={ctx.clerkUserId}
        canApprove={canApproveAgents}
      />

      <VividCard tone="cyan">
        <VividSectionHeader
          eyebrow="Today"
          title="Morning digest"
          meta={<span>updated {/* digest stamp lives inside the card */}live</span>}
        />
        <TodayDigestCard digest={digest} />
      </VividCard>

      <VividCard tone="violet">
        <VividSectionHeader
          eyebrow="Ask AI"
          title="Operator copilot"
          meta={emailReady() ? <span>email · ready</span> : <span>email · offline</span>}
        />
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
      </VividCard>

      <VividCard>
        <VividSectionHeader
          eyebrow="Ecosystem"
          title="Overview"
          meta={
            <span>
              {status.totalApps} apps · {status.openRiskCount} open risks
            </span>
          }
        />
        <OverviewTiles status={status} />
      </VividCard>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <VividCard>
          <VividSectionHeader
            eyebrow="Fleet"
            title="MacTech apps"
            meta={<span>{status.totalApps} active · sorted by criticality</span>}
          />
          <AppStatusTable snapshots={snapshots} />
        </VividCard>

        <VividCard tone={status.criticalRiskCount > 0 ? "rose" : "default"}>
          <VividSectionHeader
            eyebrow="Risk"
            title="Open risks"
            meta={
              <span>
                {status.openRiskCount} · {status.criticalRiskCount} high/critical
              </span>
            }
          />
          <RiskFeed risks={risks} />
        </VividCard>
      </section>

      <VividCard className="text-xs text-mt-text-3">
        <div className="flex items-center gap-2 text-mt-text-2">
          <Compass className="h-3.5 w-3.5 text-mt-cyan" />
          <span className="font-mt-display text-sm font-medium text-mt-text">
            About the Command Center
          </span>
        </div>
        <p className="mt-2 max-w-3xl leading-relaxed">
          Command Center is the flagship operational surface of MacTech Suite. It correlates
          the App Registry, runtime health, deployment drift, repository intelligence, agent
          activity, and traffic across the ecosystem into one executive-readable page. The
          &ldquo;Today&rdquo; digest at the top is your morning page: critical right-now state plus
          24h activity across every signal. Ask AI grounded on this digest, or scroll to the
          per-app and per-risk action surfaces below.
        </p>
        <p className="mt-2 max-w-3xl leading-relaxed">
          Need a customer-facing surface? The{" "}
          <Link
            href="/admin/public-status"
            className="text-mt-cyan underline-offset-2 hover:underline"
          >
            public status page
          </Link>{" "}
          renders a sanitized view of opt-in apps at{" "}
          <Link
            href="/status"
            target="_blank"
            rel="noopener noreferrer"
            className="text-mt-cyan underline-offset-2 hover:underline"
          >
            /status
          </Link>
          .
        </p>
      </VividCard>
    </div>
  );
}
