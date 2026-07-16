import { LEGACY_ENV_KEY_NAME } from "./env";

/**
 * State of the pre-migration `AUDIT_INGEST_API_KEY` credential.
 *
 * The env var used to be an auth fallback in its own right — present meant
 * usable, and usable meant all scopes. That fallback is gone (see
 * lib/api-auth.ts): the var's only remaining role is that prisma/seed.ts hashes
 * it into an ApiKey row, so the *row's* status decides whether it still works.
 *
 * /admin/api-keys warned off `auditIngestionConfigured()` alone, which is why
 * it kept claiming an "active … all scopes" key months after the row was
 * revoked — the two facts had come apart and nothing was comparing them.
 */
export type LegacyApiKeyState =
  /** No env var, no row — nothing to say. */
  | { kind: "absent" }
  /** Row is active and usable. `scopes` is what it actually grants — never assume all. */
  | { kind: "active"; scopes: string[]; untagged: boolean }
  /** Env var still set in Railway, but it grants nothing. Dead config worth removing. */
  | { kind: "inert"; rowExists: boolean };

export interface LegacyKeyRow {
  name: string;
  status: string;
  scopes: string[];
  appKey: string | null;
}

export function legacyApiKeyState(
  keys: readonly LegacyKeyRow[],
  envVarPresent: boolean,
): LegacyApiKeyState {
  const row = keys.find((k) => k.name === LEGACY_ENV_KEY_NAME) ?? null;

  if (row?.status === "active") {
    return {
      kind: "active",
      scopes: [...row.scopes],
      // A null appKey is a wildcard on the paths that check it: the key can
      // assert any sourceAppKey and still pass the service_app_mismatch gate.
      untagged: row.appKey === null,
    };
  }

  if (envVarPresent) return { kind: "inert", rowExists: row !== null };

  return { kind: "absent" };
}
