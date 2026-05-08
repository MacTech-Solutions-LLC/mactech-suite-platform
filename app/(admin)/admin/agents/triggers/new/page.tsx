/**
 * /admin/agents/triggers/new — create a new scheduled trigger.
 *
 * Permission: AGENTS_CREATE.
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { TriggerForm } from "@/components/agents/trigger-form";

export const dynamic = "force-dynamic";

export default async function NewTriggerPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.AGENTS_CREATE);

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
        title="New scheduled trigger"
        description="Save an IBE Intent + cron expression. Each fire is identical to a browser-driven run with the same Intent — IBE gates apply, approval-required steps queue for browser approval."
      />

      <TriggerForm />
    </div>
  );
}
