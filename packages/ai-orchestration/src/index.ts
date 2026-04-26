/**
 * MacTech Suite Platform — AI Orchestration Package
 *
 * Public surface of the ai-orchestration package.
 *
 * Exports type contracts and registry stubs only.
 * No external AI API calls. No live model integrations.
 * No production data mutations.
 *
 * MT-NEURAL-001: Scaffold — contracts and stubs only.
 */

export type { MaxTriggerEvent } from "./max-avatar/types";
export type { ShadowTestRequest } from "./digital-twin/types";
export type { AiSkillDefinition } from "./skills/types";
export { aiSkillRegistry, getEnabledSkills, findSkillById } from "./skills/registry";
