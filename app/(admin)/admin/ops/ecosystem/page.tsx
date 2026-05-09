/**
 * /admin/ops/ecosystem — visual map of the MacTech app ecosystem.
 * Nodes are apps (sized + colored by health + open risk count).
 * Edges are AppDependency rows (styled by dependencyType +
 * criticality).
 */

import Link from "next/link";
import { Activity } from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { EcosystemGraph } from "@/components/ecosystem/ecosystem-graph";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getEcosystemGraph } from "@/lib/services/command-center/ecosystem-graph-service";

export const dynamic = "force-dynamic";

export default async function EcosystemPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
  const graph = await getEcosystemGraph({ trafficWindowHours: 24 });
  const totalObservedCalls = graph.edges.reduce((n, e) => n + (e.observedCalls ?? 0), 0);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ecosystem"
        description="Every MacTech app + the dependencies between them. AppDependency declares the surface; AppCallEvent (last 24h) modulates edge thickness so observed traffic shows through. Health colors come from the Slice 1 probe loop. Click a node to open the app's public URL."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/ops/traffic">
              <Activity className="mr-1 h-3 w-3" aria-hidden="true" />
              {totalObservedCalls} call{totalObservedCalls === 1 ? "" : "s"} (24h)
            </Link>
          </Button>
        }
      />
      <EcosystemGraph graph={graph} />
    </div>
  );
}
