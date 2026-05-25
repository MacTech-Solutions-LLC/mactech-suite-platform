/**
 * /command-center — the flagship operational surface of MacTech Suite.
 *
 * Read-gated by COMMAND_CENTER_VIEW (mactech_admin / support / auditor /
 * read-only); the Sync now button is hidden for users without the
 * COMMAND_CENTER_MANAGE permission.
 *
 * Sprint 55 (2026-05) — page reshape per research brief LP1/LP3/LP7/LP10:
 *   Zone A — Right now    : AttentionRail consolidates fix-unhealthy,
 *                           awaiting-approval, and critical-now into
 *                           one decisive widget.
 *   Zone B — Last 24 hours: 4 inline count chips + brushable activity
 *                           chart + today digest (24h sections).
 *   Zone C — Drill in     : apps table + open risks two-up.
 *   Footer                : one-line quiet link row (was a 200-word
 *                           marketing card).
 *
 * The 8-tile VividStatGrid is gone (count chips replace its
 * Apps/Deploys/Risks/AgentRuns roles). The ecosystem map is demoted
 * under a <details> disclosure below the apps table.
 */

import Link from "next/link";
import { LiveReconciliationIndicator } from "./_components/live-reconciliation-indicator";
import { OperatorRail, type OperatorRailApp } from "./_components/operator-rail";
import { AppStatusTable } from "@/components/command-center/app-status-table";
import { RiskFeed } from "@/components/command-center/risk-feed";
import { SyncNowButton } from "@/components/command-center/sync-now-button";
import { TodayDigestCard } from "@/components/command-center/today-digest";
import { AskAIPanel } from "@/components/ai/ask-ai-panel";
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
import { VividCard, VividSectionHeader } from "@/components/vivid/vivid-card";
import type { BrushableRow } from "./_components/brushable-activity";
import { BrushableActivityLazy } from "./_components/brushable-activity-lazy";
import { bucket24h } from "./_components/bucket-24h";
import { EcosystemMap } from "./_components/ecosystem-map";
import { AttentionRail } from "./_components/attention-rail";
import { ZoneHeader } from "./_components/zone-header";
import { ZoneBChips } from "./_components/zone-b-chips";

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

  // Sprint 46 — bucket the digest's flat 24h event lists into 24
  // hourly rows for the brushable activity chart. Done at the
  // server so the wire payload stays small and the chart renders
  // instantly client-side.
  const deployBuckets = bucket24h(digest.deploys.map((d) => ({ at: d.checkedAt })));
  const agentBuckets = bucket24h(
    digest.agentRuns.map((r) => ({ at: r.completedAt ?? r.createdAt })),
  );
  const riskBuckets = bucket24h(
    digest.risksOpened.map((r) => ({ at: r.detectedAt })),
  );
  const wfBuckets = bucket24h(
    digest.failedWorkflows.map((w) => ({ at: w.startedAt })),
  );
  const activityRows: BrushableRow[] = deployBuckets.map((b, i) => ({
    t: b.t,
    deploys: b.n,
    agentRuns: agentBuckets[i]?.n ?? 0,
    risksOpened: riskBuckets[i]?.n ?? 0,
    failedWorkflows: wfBuckets[i]?.n ?? 0,
  }));

  // Sprint 51 — operator-rail derived data.
  const railApps: OperatorRailApp[] = snapshots.map((s) => ({
    appKey: s.app.appKey,
    name: s.app.name,
    criticality: s.app.criticality,
    health: s.latestHealth?.status ?? "unknown",
    openRisks: s.openRisks.length,
    hasCriticalRisk: s.openRisks.some((r) => r.severity === "critical"),
  }));

  return (
    <div className="space-y-6">
      <CCHero
        eyebrow="MacTech Suite · Command Center"
        titlePrefix="One sign-in,"
        titleEmphasis="every app,"
        titleSuffix="full audit trail."
        tagline="Single internal control plane for the MacTech ecosystem — identity, app registry, runtime health, deployment drift, repository intelligence, and operational risk, correlated into one executive-readable page."
        actions={
          <div className="flex items-center gap-3">
            <LiveReconciliationIndicator
              initialAt={status.lastReconciliationAt?.toISOString() ?? null}
            />
            {canManage ? <SyncNowButton /> : null}
          </div>
        }
      />

      <div className="flex items-start gap-6">
        <OperatorRail apps={railApps} />
        <div className="min-w-0 flex-1 space-y-8">
          {/* ZONE A — Right now -------------------------------------- */}
          <section
            id="zone-right-now"
            aria-labelledby="zone-right-now-title"
            className="space-y-3"
          >
            <ZoneHeader
              id="zone-right-now-title"
              eyebrow="Zone A"
              title="Right now"
              tone="cyan"
            />
            <AttentionRail
              digest={digest}
              fixable={fixable}
              viewerClerkUserId={ctx.clerkUserId}
              canApprove={canApproveAgents}
              canStage={canStageAgents}
            />
          </section>

          {/* ZONE B — Last 24 hours ---------------------------------- */}
          <section
            id="zone-last-24h"
            aria-labelledby="zone-last-24h-title"
            className="space-y-4"
          >
            <ZoneHeader
              id="zone-last-24h-title"
              eyebrow="Zone B"
              title="Last 24 hours"
              meta={<ZoneBChips status={status} digest={digest} />}
            />

            <VividCard>
              <VividSectionHeader
                eyebrow="Activity"
                title="Hourly trend"
                meta={<span>drag the brush to scope totals</span>}
              />
              <BrushableActivityLazy rows={activityRows} />
            </VividCard>

            <VividCard>
              <VividSectionHeader
                eyebrow="Digest"
                title="What happened"
                meta={<span>updated live</span>}
              />
              <TodayDigestCard digest={digest} />
            </VividCard>

            <VividCard>
              <VividSectionHeader
                eyebrow="Ask AI"
                title="Operator copilot"
                meta={
                  emailReady() ? (
                    <span>email · ready</span>
                  ) : (
                    <span>email · offline</span>
                  )
                }
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
          </section>

          {/* ZONE C — Drill in --------------------------------------- */}
          <section
            id="zone-drill-in"
            aria-labelledby="zone-drill-in-title"
            className="space-y-4"
          >
            <ZoneHeader
              id="zone-drill-in-title"
              eyebrow="Zone C"
              title="Drill in"
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <VividCard>
                <VividSectionHeader
                  eyebrow="Fleet"
                  title="MacTech apps"
                  meta={
                    <span>
                      {status.totalApps} active · sorted by criticality
                    </span>
                  }
                />
                <AppStatusTable snapshots={snapshots} />
              </VividCard>

              <VividCard tone={status.criticalRiskCount > 0 ? "rose" : "default"}>
                <VividSectionHeader
                  eyebrow="Risk"
                  title="Open risks"
                  meta={
                    <span>
                      {status.openRiskCount} · {status.criticalRiskCount}{" "}
                      high/critical
                    </span>
                  }
                />
                <RiskFeed risks={risks} />
              </VividCard>
            </div>

            {/* Ecosystem map demoted under a disclosure (LP7). One-line
                summary on the closed state — operator opens only if
                they want the spatial mental model. */}
            <details className="group rounded-mt-3 border border-mt-hairline bg-mt-surface-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 transition hover:bg-mt-surface-2">
                <span className="flex items-center gap-3">
                  <span className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3">
                    Ecosystem map
                  </span>
                  <span className="text-xs text-mt-text-2">
                    {snapshots.length} apps ·{" "}
                    <span className={status.byHealth.down > 0 ? "text-mt-rose" : "text-mt-text-3"}>
                      {status.byHealth.down} down
                    </span>{" "}
                    ·{" "}
                    <span className={status.byHealth.degraded > 0 ? "text-mt-amber" : "text-mt-text-3"}>
                      {status.byHealth.degraded} degraded
                    </span>
                  </span>
                </span>
                <span className="font-mt-mono text-[10px] uppercase tracking-[0.18em] text-mt-text-3 group-open:text-mt-cyan">
                  <span className="group-open:hidden">open map</span>
                  <span className="hidden group-open:inline">close</span>
                </span>
              </summary>
              <div className="border-t border-mt-hairline px-5 py-5">
                <EcosystemMap snapshots={snapshots} />
              </div>
            </details>
          </section>

          {/* FOOTER — quiet links only (LP10). The 200-word marketing
              card is gone — operators visit this page dozens of times
              daily and don't need a re-introduction. */}
          <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-mt-hairline pt-4 text-xs text-mt-text-3">
            <Link
              href="/admin/public-status"
              className="hover:text-mt-text"
            >
              Public status console
            </Link>
            <span aria-hidden>·</span>
            <Link
              href="/status"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-mt-text"
            >
              /status (public)
            </Link>
            <span aria-hidden>·</span>
            <span className="font-mt-mono uppercase tracking-[0.16em]">
              docs/COMMAND_CENTER.md
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
