"use client";

/**
 * Sprint 55 — AttentionRail (Zone A).
 *
 * Merges three previously-separate surfaces into one decisive widget
 * (LP3 in the research brief):
 *
 *   1. FixUnhealthyBanner (warning yellow)         → fixable-apps row
 *   2. AwaitingApprovalStrip (warning yellow)      → awaiting-approval rows
 *   3. TodayDigest's CriticalNowStrip (5 red tiles) → critical-now rows
 *
 * The rail enforces strict color semantics:
 *   - amber  = warning / action-required (awaiting approval, fixable)
 *   - rose   = critical / destructive (apps down, criticals open,
 *              failed deploys 24h, refused runs 24h)
 *   - neutral = all clear / quiet status
 *
 * Inline actions on each row preserve the existing fast-path:
 *   - QuickApproveButton on awaiting-approval rows (unchanged contract)
 *   - Stage button on fixable-apps row → stageFixUnhealthyRuns()
 *
 * When everything is empty we render a one-line "All clear" pill —
 * not a 200-word marketing paragraph.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Loader2,
  ShieldOff,
  Siren,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import { QuickApproveButton } from "@/components/agents/quick-approve-button";
import { stageFixUnhealthyRuns } from "@/lib/services/command-center/fix-unhealthy-actions";
import type { TodayDigest } from "@/lib/services/command-center/today-digest-service";
import type { FixableApp } from "@/lib/services/command-center/fix-unhealthy-service";
import { cn } from "@/lib/utils";

interface Props {
  digest: TodayDigest;
  fixable: FixableApp[];
  /** Viewer's clerk user id — gates QuickApproveButton's "you authored" state. */
  viewerClerkUserId: string;
  canApprove: boolean;
  canStage: boolean;
}

type RowTone = "amber" | "rose" | "neutral";

export function AttentionRail({
  digest,
  fixable,
  viewerClerkUserId,
  canApprove,
  canStage,
}: Props) {
  const critical = digest.criticalNow;
  const awaitingRuns = digest.awaitingApprovalRuns;

  // Critical-now items (rose): only those with non-zero counts. Each
  // row deep-links to where the operator actually acts.
  const criticalRows = [
    {
      key: "criticals",
      label: "open critical risk",
      labelPlural: "open critical risks",
      value: critical.openCriticalRisks,
      Icon: Siren,
      href: "/admin/ops/risk?severity=critical",
    },
    {
      key: "down",
      label: "app currently down",
      labelPlural: "apps currently down",
      value: critical.appsCurrentlyDown,
      Icon: ShieldOff,
      href: "/admin/public-status",
    },
    {
      key: "failed-deploys",
      label: "deploy failed (24h)",
      labelPlural: "deploys failed (24h)",
      value: critical.failedDeployments24h,
      Icon: XCircle,
      href: "/admin/ops/deployments",
    },
    {
      key: "refused-agents",
      label: "agent run refused by IBE (24h)",
      labelPlural: "agent runs refused by IBE (24h)",
      value: critical.refusedAgentRuns24h,
      Icon: Bot,
      href: "/admin/agents",
    },
  ].filter((r) => r.value > 0);

  const hasAwaiting = awaitingRuns.length > 0;
  const hasFixable = fixable.length > 0;
  const hasCritical = criticalRows.length > 0;

  const isEmpty = !hasAwaiting && !hasFixable && !hasCritical;

  if (isEmpty) {
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-mt-3 border border-mt-hairline bg-mt-surface-1 px-4 py-3"
        role="status"
        aria-label="All clear"
      >
        <CheckCircle2 className="h-4 w-4 text-mt-lime" aria-hidden />
        <span className="font-mt-display text-sm font-medium text-mt-text">
          All clear
        </span>
        <span className="text-xs text-mt-text-3">
          · no critical signals, no awaiting approvals, no fixable apps
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Critical-now rows (rose) — one row per non-zero metric, deep-linked. */}
      {criticalRows.length > 0 ? (
        <Row tone="rose">
          <Siren className="h-4 w-4 text-mt-rose" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-mt-display text-sm font-semibold text-mt-text">
              Critical now
            </div>
            <ul className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mt-text-2">
              {criticalRows.map((r) => (
                <li key={r.key} className="inline-flex items-center gap-1.5">
                  <r.Icon className="h-3 w-3 shrink-0 text-mt-rose" aria-hidden />
                  <Link
                    href={r.href}
                    className="group inline-flex items-center gap-1 hover:text-mt-text"
                  >
                    <span className="font-semibold tabular-nums text-mt-rose">
                      {r.value}
                    </span>
                    <span>{r.value === 1 ? r.label : r.labelPlural}</span>
                    <ChevronRight className="h-3 w-3 text-mt-text-4 transition group-hover:translate-x-0.5 group-hover:text-mt-rose" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Row>
      ) : null}

      {/* Awaiting approval rows (amber) — single row, lists each run inline. */}
      {hasAwaiting ? (
        <Row tone="amber">
          <Sparkles className="h-4 w-4 text-mt-amber" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mt-display text-sm font-semibold text-mt-text">
                {awaitingRuns.length} agent run
                {awaitingRuns.length === 1 ? "" : "s"} awaiting your approval
              </span>
              <Link
                href="/admin/agents?status=awaiting"
                className="ml-auto inline-flex items-center gap-1 text-xs text-mt-text-3 hover:text-mt-text"
              >
                Open agent console
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="mt-2 space-y-1">
              {awaitingRuns.map((r) => {
                const isRequester = r.requestedByClerkUserId === viewerClerkUserId;
                return (
                  <li
                    key={r.id}
                    className="flex items-start gap-3 rounded-mt-2 border border-mt-amber/15 bg-mt-bg-2 px-3 py-2"
                  >
                    <Bot
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mt-text-3"
                      aria-hidden
                    />
                    <Link
                      href={`/admin/agents/${r.id}`}
                      className="group min-w-0 flex-1"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="truncate font-medium text-mt-text group-hover:text-mt-cyan">
                          {firstLine(r.intentGoal ?? r.requestText)}
                        </span>
                        {r.intentGoal && r.intentGoal !== r.requestText ? (
                          <span className="rounded-mt-1 border border-mt-cyan/30 bg-mt-cyan/10 px-1.5 py-0.5 font-mt-mono text-[9px] uppercase tracking-[0.16em] text-mt-cyan">
                            IBE-gated
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-mt-text-3">
                        <span>{r.requestedByEmail}</span>
                        {r.triggeredByApiKeyName ? (
                          <>
                            <span>·</span>
                            <span className="font-mt-mono">
                              via {r.triggeredByApiKeyName}
                            </span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>
                          {r.plannedStepCount} step
                          {r.plannedStepCount === 1 ? "" : "s"}
                        </span>
                        <span>·</span>
                        <span>{timeAgo(r.createdAt)}</span>
                      </div>
                    </Link>
                    {canApprove ? (
                      <QuickApproveButton runId={r.id} isRequester={isRequester} />
                    ) : (
                      <Link
                        href={`/admin/agents/${r.id}`}
                        className="inline-flex h-7 items-center rounded-mt-1 border border-mt-hairline-strong bg-mt-surface-1 px-2.5 font-mt-mono text-[10px] uppercase tracking-[0.16em] text-mt-text-2 hover:bg-mt-surface-2 hover:text-mt-text"
                      >
                        Review
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </Row>
      ) : null}

      {/* Fixable-apps row (amber) — staging server action. */}
      {hasFixable ? (
        <FixableRow fixable={fixable} canStage={canStage} />
      ) : null}
    </div>
  );
}

function FixableRow({
  fixable,
  canStage,
}: {
  fixable: FixableApp[];
  canStage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    staged: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await stageFixUnhealthyRuns();
        if (!r.ok) {
          setError(r.reason ?? "stage_failed");
          return;
        }
        setResult({ staged: r.staged, skipped: r.skipped });
      } catch (err) {
        setError(err instanceof Error ? err.message : "stage_failed");
      }
    });
  };

  if (result) {
    return (
      <Row tone="neutral">
        <CheckCircle2 className="h-4 w-4 text-mt-lime" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-mt-display text-sm font-semibold text-mt-text">
            {result.staged} agent run{result.staged === 1 ? "" : "s"} staged for
            review
            {result.skipped > 0 ? (
              <span className="ml-1 text-xs font-normal text-mt-text-3">
                · {result.skipped} skipped (already in flight)
              </span>
            ) : null}
          </div>
          <Link
            href="/admin/agents"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-mt-cyan hover:underline"
          >
            Review staged runs
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </Row>
    );
  }

  return (
    <Row tone="amber">
      <Wrench className="h-4 w-4 text-mt-amber" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mt-display text-sm font-semibold text-mt-text">
            {fixable.length} app{fixable.length === 1 ? "" : "s"} can be
            auto-fixed by the cross-repo agent
          </span>
          <span className="text-xs text-mt-text-3">
            · stages a @claude routine to add{" "}
            <span className="font-mt-mono">/api/health</span> — awaiting your
            approval before anything fires
          </span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mt-text-3">
          {fixable.slice(0, 6).map((a) => (
            <li key={a.appId} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  a.symptom === "down"
                    ? "bg-mt-rose"
                    : a.symptom === "degraded"
                      ? "bg-mt-amber"
                      : "bg-mt-text-4",
                )}
              />
              <span className="font-medium text-mt-text-2">{a.name}</span>
              <span className="font-mt-mono text-mt-text-4">
                {a.repoFullName}
              </span>
              <span>· {a.symptom}</span>
            </li>
          ))}
          {fixable.length > 6 ? (
            <li className="text-mt-text-4">+ {fixable.length - 6} more</li>
          ) : null}
        </ul>
        {error ? (
          <div className="mt-2 text-[11px] text-mt-rose">{error}</div>
        ) : null}
      </div>
      {canStage ? (
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-mt-2 border border-mt-amber/30 bg-mt-amber/10 px-3 font-mt-mono text-[10px] uppercase tracking-[0.16em] text-mt-amber transition hover:bg-mt-amber/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mt-amber disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Staging…
            </>
          ) : (
            <>
              <Wrench className="h-3.5 w-3.5" aria-hidden />
              Stage {fixable.length}
            </>
          )}
        </button>
      ) : (
        <div className="shrink-0 self-center font-mt-mono text-[10px] uppercase tracking-[0.16em] text-mt-text-4">
          requires agents:create
        </div>
      )}
    </Row>
  );
}

function Row({ tone, children }: { tone: RowTone; children: React.ReactNode }) {
  const cls =
    tone === "rose"
      ? "border-mt-rose/30 bg-mt-rose/5"
      : tone === "amber"
        ? "border-mt-amber/30 bg-mt-amber/5"
        : "border-mt-hairline bg-mt-surface-1";
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-mt-3 border px-4 py-3",
        cls,
      )}
    >
      {children}
    </div>
  );
}

function firstLine(s: string): string {
  const idx = s.indexOf("\n");
  return idx === -1 ? s : s.slice(0, idx);
}

function timeAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

