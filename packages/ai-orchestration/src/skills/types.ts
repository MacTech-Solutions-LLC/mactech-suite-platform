/**
 * MacTech Suite Platform — AI Skills Type Contracts
 *
 * Defines the typed interface for the plugin-first AI Skills framework.
 *
 * Skills are discrete, permission-gated AI capabilities that can be
 * registered, versioned, enabled, and disabled without code changes.
 *
 * Boundaries:
 * - Skills must declare required permissions — no permission bypass allowed.
 * - Skills must declare input/output schemas.
 * - Skills must be disabled by default; explicit enablement required.
 * - Skills must not access raw secrets or directly mutate production data.
 * - Skills must be tenant-aware — tenantId must be included in all invocations.
 *
 * MT-NEURAL-001: Type contract only. No skill implementations registered.
 */

// ============================================================================
// AI SKILL DEFINITION
// ============================================================================

/**
 * The definition contract for a registerable AI skill.
 *
 * Every skill registered in the AiSkillRegistry must conform to this type.
 *
 * id: Stable, unique identifier. Never change after registration.
 * version: Semantic version string (e.g., "1.0.0").
 * requiredPermissions: RBAC permission strings that a user must hold.
 * inputSchema: Zod schema (or equivalent) for validating skill input.
 * outputSchema: Zod schema (or equivalent) for validating skill output.
 * enabled: Skills are disabled by default. Must be explicitly enabled.
 */
export type AiSkillDefinition = {
  id: string;
  name: string;
  version: string;
  description: string;
  requiredPermissions: string[];
  inputSchema: unknown;
  outputSchema: unknown;
  enabled: boolean;
};
