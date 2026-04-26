/**
 * MacTech Suite Platform — AI Skills Registry
 *
 * The central registry for all registerable AI skills.
 *
 * Skills are registered here and resolved at runtime by the AI orchestration
 * layer. The registry is intentionally empty in v1 — no real skills exist yet.
 *
 * Future skills will be added here with explicit enablement, permission
 * declarations, and versioning. See docs/ai-hooks/ for the registration guide.
 *
 * MT-NEURAL-001: Empty registry scaffold. No skills registered.
 */

import type { AiSkillDefinition } from "./types";

/**
 * The global AI skill registry.
 *
 * In v1 this is a static array. Future phases may migrate to a database-backed
 * registry with per-tenant enablement overrides.
 *
 * Rules:
 * - All skills default to enabled: false.
 * - Skills must declare requiredPermissions before being accepted.
 * - Skills must be reviewed before enablement in any environment.
 */
export const aiSkillRegistry: AiSkillDefinition[] = [
  // No skills registered in MT-NEURAL-001 scaffold.
  // Future skills added here follow the AiSkillDefinition contract.
];

/**
 * Returns all currently enabled skills from the registry.
 * In v1, this always returns an empty array.
 */
export function getEnabledSkills(): AiSkillDefinition[] {
  return aiSkillRegistry.filter((skill) => skill.enabled);
}

/**
 * Looks up a skill by its stable id.
 * Returns undefined if not found or not registered.
 */
export function findSkillById(id: string): AiSkillDefinition | undefined {
  return aiSkillRegistry.find((skill) => skill.id === id);
}
