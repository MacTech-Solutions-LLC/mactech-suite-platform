/**
 * /admin/ops/ecosystem — visual map of the MacTech app ecosystem.
 * Nodes are apps (sized + colored by health + open risk count).
 * Edges are AppDependency rows (styled by dependencyType +
 * criticality).
 */

import { PageHeader } from "@/components/layout/admin-shell";
import { EcosystemGraph } from "@/components/ecosystem/ecosystem-graph";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getEcosystemGraph } from "@/lib/services/command-center/ecosystem-graph-service";

export const dynamic = "force-dynamic";

export default async function EcosystemPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.OPS_VIEW);
  const graph = await getEcosystemGraph();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ecosystem"
        description="Every MacTech app + the dependencies between them. Health colors come from the Slice 1 probe loop; edges come from AppDependency. Click a node to open the app's public URL."
      />
      <EcosystemGraph graph={graph} />
    </div>
  );
}
