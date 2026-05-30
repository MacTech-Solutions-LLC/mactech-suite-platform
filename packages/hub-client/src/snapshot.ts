import { createHash } from "crypto";
import { HubContractValidationError } from "./errors";
import type { HubAuthoritySnapshot } from "./types";

export type VerifyAuthoritySnapshotOptions = {
  now?: Date;
  allowStaleForReadOnly?: boolean;
  privileged?: boolean;
};

export function verifyAuthoritySnapshot(
  snapshot: HubAuthoritySnapshot,
  options: VerifyAuthoritySnapshotOptions = {},
): HubAuthoritySnapshot {
  assertSnapshotShape(snapshot);
  const expectedHash = hashAuthoritySnapshot(snapshot);
  if (snapshot.cache.authorityHash !== expectedHash) {
    throw new HubContractValidationError("Authority snapshot hash mismatch.");
  }
  if (!snapshot.decision.allow) {
    throw new HubContractValidationError(`Authority snapshot denied: ${snapshot.decision.denyReason ?? "unknown"}.`);
  }

  const now = options.now ?? new Date();
  const expiresAt = new Date(snapshot.cache.expiresAt);
  const expired = Number.isNaN(expiresAt.getTime()) || expiresAt <= now;
  const mayUseStale = options.allowStaleForReadOnly && !options.privileged;
  if (expired && !mayUseStale) {
    throw new HubContractValidationError("Authority snapshot cache is expired.");
  }
  return snapshot;
}

export function hashAuthoritySnapshot(snapshot: HubAuthoritySnapshot): string {
  const hashInput = {
    ...snapshot,
    cache: { ...snapshot.cache, authorityHash: "" },
  };
  return createHash("sha256").update(stableJson(hashInput)).digest("hex");
}

export function assertSnapshotShape(value: unknown): asserts value is HubAuthoritySnapshot {
  if (!value || typeof value !== "object") {
    throw new HubContractValidationError("Hub returned a malformed authority snapshot.");
  }
  const snapshot = value as HubAuthoritySnapshot;
  if (
    typeof snapshot.clerkUserId !== "string" ||
    typeof snapshot.appKey !== "string" ||
    !Array.isArray(snapshot.memberRoles) ||
    !Array.isArray(snapshot.resolvedPermissions) ||
    !snapshot.cache ||
    typeof snapshot.cache.authorityHash !== "string" ||
    typeof snapshot.cache.expiresAt !== "string" ||
    !snapshot.decision ||
    typeof snapshot.decision.allow !== "boolean"
  ) {
    throw new HubContractValidationError("Hub authority snapshot failed contract validation.");
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}
