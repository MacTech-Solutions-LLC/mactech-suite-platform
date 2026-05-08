/**
 * /admin/repositories/commits — cross-repo commit feed.
 *
 * Filters: ?riskOnly=true, ?repoId=<id>, ?appId=<id>.
 */

import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { CommitFeed } from "@/components/repositories/commit-feed";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getRecentCommitsAcrossRepos } from "@/lib/services/command-center/repo-intelligence-service";

export const dynamic = "force-dynamic";

interface SearchParams {
  riskOnly?: string;
  repoId?: string;
  appId?: string;
}

export default async function CommitsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.REPOSITORIES_VIEW);
  const riskOnly = searchParams?.riskOnly === "true";
  const commits = await getRecentCommitsAcrossRepos({
    take: 100,
    riskOnly,
    repoId: searchParams?.repoId,
    appId: searchParams?.appId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Commit intelligence"
        description="Latest commits across every repo that powers a MacTech app. Sensitive paths (auth, schema, env, audit) are flagged on ingest by the security_sensitive_change evaluator."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={riskOnly ? "default" : "outline"}
              asChild
            >
              <Link
                href={
                  riskOnly
                    ? "/admin/repositories/commits"
                    : "/admin/repositories/commits?riskOnly=true"
                }
              >
                {riskOnly ? "All commits" : "Sensitive only"}
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/repositories">← Repos</Link>
            </Button>
          </div>
        }
      />
      <CommitFeed commits={commits} />
    </div>
  );
}
