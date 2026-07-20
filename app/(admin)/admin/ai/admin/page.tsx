import { PageHeader } from "@/components/layout/admin-shell";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { getAiConfig } from "@/lib/ai/config";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/tool-registry";

export const dynamic = "force-dynamic";

export default async function AiAdminPage() {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.AI_ADMIN);
  const config = getAiConfig();
  const rows = [
    ["AI enabled", String(config.enabled)], ["Provider", config.provider], ["Configured model", config.defaultModel ?? "Not configured"],
    ["Provider credential", config.nvidiaApiKey ? "Configured (hidden)" : "Not configured"], ["External inference", String(config.externalInferenceEnabled)],
    ["Allowed classifications", config.allowedClassifications.join(", ")], ["Development mode", String(config.developmentMode)],
    ["Retrieval", "Deterministic approved corpus"], ["Registered tools", String(Object.keys(AI_TOOL_REGISTRY).length)],
    ["Conversation bodies stored", String(config.storeConversationContent)], ["Audit retention policy", `${config.auditRetentionDays} days`],
  ];
  return <div className="space-y-6"><PageHeader title="MacTech AI administration" description="Sanitized provider, policy, retrieval, and tool status. Provider secrets are never displayed." /><div className="grid gap-4 md:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-card p-4"><div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-2 font-medium">{value}</div></div>)}</div><div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">This branch is a development MVP. It is not deployed, CUI-approved, FedRAMP-authorized, or licensed for production use.</div></div>;
}
