/**
 * /admin/repositories/release-notes — release notes feed across the
 * MacTech ecosystem. Generation is on demand; the deterministic
 * generator always works, AI-augmented activates when
 * ENABLE_AI_SUMMARIES + OPENAI_API_KEY are set.
 */

import { PageHeader } from "@/components/layout/admin-shell";
import { ReleaseNotesList } from "@/components/release-notes/release-notes-list";
import { GenerateButton } from "@/components/release-notes/generate-button";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRecentCommitSummaries } from "@/lib/services/command-center/commit-summary-service";
import { aiSummariesConfigured } from "@/lib/integrations/ai/summary-client";

export const dynamic = "force-dynamic";

export default async function ReleaseNotesPage() {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
  const canManage = ctx.permissions.includes(PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE);
  const summaries = await getRecentCommitSummaries({ take: 30 });
  const ai = aiSummariesConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Release notes"
        description={`Daily / weekly / release / manual summaries built from GitCommitEvent rows. ${ai ? "AI-augmented narrative is enabled." : "AI augmentation is off — set ENABLE_AI_SUMMARIES=true + OPENAI_API_KEY to enable."}`}
        actions={canManage ? <GenerateButton /> : undefined}
      />
      <ReleaseNotesList summaries={summaries} />
    </div>
  );
}
