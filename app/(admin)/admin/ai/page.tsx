import { redirect } from "next/navigation";
import { AiWorkspace } from "@/components/ai/ai-workspace";
import { PageHeader } from "@/components/layout/admin-shell";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function MacTechAiPage() {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AI_ACCESS);
  const organizations = await prisma.customerOrganization.findMany({ where: { status: "active" }, orderBy: [{ isInternalMacTech: "desc" }, { name: "asc" }], select: { id: true, name: true } });
  if (organizations.length === 0) redirect("/access-restricted?reason=no_active_organization");
  return <div className="space-y-6"><PageHeader title="MacTech AI" description="Tenant-aware Suite intelligence with approved retrieval, controlled tools, and human-gated actions." /><AiWorkspace organizations={organizations} canAdmin={ctx.permissions.includes(PLATFORM_PERMISSIONS.AI_ADMIN)} /></div>;
}
