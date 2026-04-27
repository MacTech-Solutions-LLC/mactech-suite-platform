/**
 * MacTech Suite Platform — Shadow-Test Header Validator
 *
 * Parses and validates the x-mactech-shadow-test request header.
 *
 * This validator is the single authoritative parser for shadow mode resolution.
 * It must be used at the gateway layer — never re-parse the header downstream.
 *
 * Header: x-mactech-shadow-test
 * Allowed values: "off" | "observe" | "simulate"
 *
 * Security:
 * - Unknown or malformed values default to "off" (fail-closed).
 * - "simulate" mode must be gated by environment flag or role in future phases.
 *   In v1, simulate is accepted syntactically but routes to a no-op stub.
 * - This header must never be trusted from public unauthenticated requests
 *   without additional authorization checks (future enforcement, not v1 runtime).
 *
 * MT-NEURAL-001: Types and validator only. No runtime enforcement yet.
 */

import { z } from "zod";
import type { ShadowContext, ShadowMode } from "../types/index";

// ============================================================================
// SHADOW MODE SCHEMA
// ============================================================================

/**
 * Zod schema for the raw x-mactech-shadow-test header value.
 * Accepts only the three canonical values; rejects everything else.
 */
export const ShadowModeSchema = z.enum(["off", "observe", "simulate"]);

/**
 * Header name constant. Use this everywhere instead of inline strings.
 */
export const SHADOW_TEST_HEADER = "x-mactech-shadow-test" as const;

// ============================================================================
// PARSER
// ============================================================================

/**
 * Parses the x-mactech-shadow-test header value into a typed ShadowContext.
 *
 * Behavior:
 * - Valid values ("off", "observe", "simulate") → resolved from header.
 * - Missing header → system_default "off".
 * - Invalid/malformed value → system_default "off" (fail-closed, no error thrown).
 *
 * @param headerValue - Raw header string or null/undefined if not present.
 * @returns Resolved ShadowContext with mode, enabled flag, and source.
 */
export function parseShadowHeader(
  headerValue: string | null | undefined
): ShadowContext {
  if (headerValue == null || headerValue.trim() === "") {
    return {
      enabled: false,
      mode: "off",
      source: "system_default",
    };
  }

  const result = ShadowModeSchema.safeParse(headerValue.trim().toLowerCase());

  if (!result.success) {
    return {
      enabled: false,
      mode: "off",
      source: "system_default",
    };
  }

  const mode: ShadowMode = result.data;

  return {
    enabled: mode !== "off",
    mode,
    source: "header",
  };
}

// ============================================================================
// TYPE EXPORT
// ============================================================================

/**
 * Inferred type of a validated shadow mode value.
 * Use this when you need the Zod-inferred type, not the union alias.
 */
export type ValidatedShadowMode = z.infer<typeof ShadowModeSchema>;
