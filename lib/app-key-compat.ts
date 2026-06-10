/**
 * Canonical suite app keys and legacy alias resolution.
 *
 * AppRegistry has no alias column — inbound legacy keys are normalized here
 * until a schema-safe alias model exists.
 */

export const GROWTH_CAPTURE_CANONICAL_APP_KEY = "growth-capture";

/** Legacy Hub AppRegistry / consumer keys mapped to canonical rows. */
export const LEGACY_APP_KEY_ALIASES: Readonly<Record<string, string>> = {
  capture: GROWTH_CAPTURE_CANONICAL_APP_KEY,
  opportunities: GROWTH_CAPTURE_CANONICAL_APP_KEY,
};

/** Rejected canonical variant — never register or accept as primary key. */
export const REJECTED_APP_KEY_VARIANTS = ["opportunity-capture"] as const;

export function resolveCanonicalAppKey(appKey: string): string {
  return LEGACY_APP_KEY_ALIASES[appKey] ?? appKey;
}

export function isLegacyAppKeyAlias(appKey: string): boolean {
  return appKey in LEGACY_APP_KEY_ALIASES;
}

export function canonicalAppKeysMatch(left: string, right: string): boolean {
  return resolveCanonicalAppKey(left) === resolveCanonicalAppKey(right);
}
