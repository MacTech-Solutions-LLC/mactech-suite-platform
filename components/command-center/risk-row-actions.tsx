"use client";

/**
 * RiskRowActions — Sprint 17.
 *
 * Renders the inline actions per OperationalRiskFlag row: Ack /
 * Resolve / Ignore + a dropdown with "Ask AI about this" and (when
 * the category supports it) a deep-link to fire a cross-repo agent
 * run that fixes the underlying gap.
 *
 * Optimistic-ish UX: each button kicks a transition, shows a brief
 * "Saved" tick, and lets Next revalidate the route to remove the
 * row from the open-risks query. Errors flip to a destructive
 * note inline.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  CheckCircle2,
  EyeOff,
  Sparkles,
  Wrench,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  acknowledgeRiskAction,
  resolveRiskAction,
  ignoreRiskAction,
} from "@/lib/services/command-center/risk-actions";

interface Props {
  riskId: string;
  status: string;
  category: string;
  title: string;
  appKey: string | null;
}

/**
 * Categories where the cross-repo agent has a known recipe. The
 * "Fix this" button only renders for these. For other categories,
 * the dropdown still has "Ask AI" — operators can investigate
 * before deciding to manually fix.
 */
const AGENT_FIXABLE: Record<string, { intent: string; contextHint?: string }> = {
  missing_health_endpoint: {
    intent:
      "Add a public anonymous /api/health Next.js route that returns JSON {status:\"ok\", service:\"<app>\", timestamp:<ISO-8601>}. The route must NOT be behind Clerk auth — exclude /api/health from middleware.ts public-route matching if needed. Match the repos existing app/ vs pages/ convention.",
    contextHint:
      "See package.json for framework version, README.md for conventions, middleware.ts for auth gate config. The MacTech Suite probes this endpoint anonymously every reconciliation tick.",
  },
  missing_build_info: {
    intent:
      "Add a public anonymous /api/build-info Next.js route that returns JSON {service, environment, commitSha, commitShortSha, branch, repo, timestamp}. Read from RAILWAY_GIT_COMMIT_SHA and related Railway-injected env vars where available. Must NOT be behind Clerk auth.",
    contextHint:
      "See package.json + README.md. The MacTech Suite uses /api/build-info to detect production-behind-main drift.",
  },
};

export function RiskRowActions({
  riskId,
  status,
  category,
  title,
  appKey,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function flash() {
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt((t) => (t && Date.now() - t > 1500 ? null : t)), 1700);
  }

  async function run<T extends { ok: boolean; reason?: string }>(
    fn: () => Promise<T>,
  ) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          setError(r.reason ?? "save_failed");
          return;
        }
        flash();
      } catch (err) {
        setError(err instanceof Error ? err.message : "save_failed");
      }
    });
  }

  // Resolved/ignored rows display the action buttons in a dimmed
  // disabled state — useful in pages that show all-statuses, not
  // just open. The /admin/ops/risk page filters to open by default
  // so this is mostly defensive.
  const terminalStatus = status === "resolved" || status === "ignored";

  // "Ask AI" prefills a prompt grounded in the open-risks dashboard.
  // Routes through /admin/ops/risk so the AskAIPanel there picks it
  // up via querystring (next sprint can wire the actual prefill).
  const askAIHref =
    `/admin/ops/risk?prompt=${encodeURIComponent(
      `Tell me what's behind the open risk "${title}" (category=${category}${
        appKey ? `, app=${appKey}` : ""
      }) and recommend one concrete next action.`,
    )}`;

  const fixable = AGENT_FIXABLE[category];

  return (
    <div className="flex items-center justify-end gap-1">
      {savedAt ? (
        <span
          aria-live="polite"
          className="inline-flex items-center gap-1 text-[11px] text-success"
        >
          <Check className="h-3 w-3" />
          saved
        </span>
      ) : null}
      {error ? (
        <span
          aria-live="polite"
          className="text-[11px] text-destructive"
          title={error}
        >
          {error.length > 24 ? error.slice(0, 24) + "…" : error}
        </span>
      ) : null}

      {status === "open" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending || terminalStatus}
          onClick={() => run(() => acknowledgeRiskAction(riskId))}
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ack"}
        </Button>
      ) : null}

      <Button
        size="sm"
        variant="outline"
        disabled={pending || terminalStatus}
        onClick={() => run(() => resolveRiskAction(riskId))}
        aria-label="Resolve risk"
      >
        <CheckCircle2 className="h-3 w-3" />
        <span className="ml-1 hidden md:inline">Resolve</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            aria-label="More actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href={askAIHref} className="flex items-center gap-2 cursor-pointer">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Ask AI about this</span>
            </Link>
          </DropdownMenuItem>
          {fixable && appKey ? (
            <DropdownMenuItem asChild>
              <Link
                href={
                  `/admin/agents?intent=cross_repo_fix` +
                  `&appKey=${encodeURIComponent(appKey)}` +
                  `&category=${encodeURIComponent(category)}`
                }
                className="flex items-center gap-2 cursor-pointer"
              >
                <Wrench className="h-3.5 w-3.5" />
                <span>Fix this with agent</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={pending || terminalStatus}
            onClick={() => run(() => ignoreRiskAction(riskId))}
            className="flex items-center gap-2"
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span>Ignore (false positive)</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
