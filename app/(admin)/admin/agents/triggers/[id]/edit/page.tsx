/**
 * /admin/agents/triggers/[id]/edit — edit a saved trigger.
 *
 * Permission: AGENTS_CREATE (read+write — same as new).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getTrigger } from "@/lib/agents/triggers-service";
import { TriggerForm } from "@/components/agents/trigger-form";
import type { AgentRiskTolerance } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function EditTriggerPage({
  params,
}: {
  params: { id: string };
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);
  const trigger = await getTrigger(params.id);
  if (!trigger) notFound();

  // Pull the saved Intent into the shape the form expects.
  const intent = (trigger.intentJson ?? {}) as {
    goal?: string;
    scopeAppIds?: string[];
    scopeRepoIds?: string[];
    invariants?: Record<string, string[]>;
    riskTolerance?: AgentRiskTolerance;
  };

  return (
    <div className="space-y-6">
      <Link
        href="/admin/agents/triggers"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to scheduled triggers
      </Link>

      <PageHeader
        title={`Edit trigger — ${trigger.name}`}
        description={`Created ${new Date(trigger.createdAt).toLocaleString()} by ${trigger.createdByEmail}.`}
      />

      <TriggerForm
        initial={{
          id: trigger.id,
          name: trigger.name,
          description: trigger.description,
          kind: trigger.kind,
          cronExpression: trigger.cronExpression ?? "",
          timezone: trigger.timezone,
          request: trigger.request,
          autoExecute: trigger.autoExecute,
          enabled: trigger.enabled,
          thresholdMetric: trigger.thresholdMetric,
          thresholdOperator: trigger.thresholdOperator,
          thresholdValue: trigger.thresholdValue,
          cooldownMinutes: trigger.cooldownMinutes,
          intent: {
            goal: intent.goal ?? "",
            scopeAppIds: intent.scopeAppIds ?? [],
            scopeRepoIds: intent.scopeRepoIds ?? [],
            invariants: intent.invariants ?? {},
            riskTolerance: (intent.riskTolerance ?? "strict") as
              | "strict"
              | "moderate"
              | "permissive",
          },
        }}
      />
    </div>
  );
}
