/**
 * Wire types between ICC, the auditor-access form, and the vault admin
 * endpoint at /_admin/allowlist on vault-001.
 */

import type { NetworkClassificationCode } from "./constants";

export interface CreateGrantRequest {
  grantId: string;
  requestId: string;
  cidr: string;
  ipVersion: 4 | 6;
  networkClassification: Exclude<NetworkClassificationCode, "unknown_or_shared">;
  reason: string;
  grantedTo: { clerkUserId: string; email: string };
  expiresAtUtc: string; // ISO-8601
}

export interface CreateGrantResponse {
  ok: boolean;
  grant_id?: string;
  expires_at_utc?: string;
  error?: string;
}

export interface RevokeGrantRequest {
  requestId: string;
  actorEmail: string;
}

export interface ListGrantsResponse {
  ok: boolean;
  grants?: Array<{
    grant_id: string;
    cidr: string;
    ip_version: number;
    network_classification: string;
    granted_to_email: string;
    created_at_utc: string;
    expires_at_utc: string;
    reason: string;
  }>;
  error?: string;
}

/** Outcome surfaced to the page from a server action. UI maps each
 *  variant to a toast / banner / fail-closed state. */
export type GrantOutcome =
  | { kind: "ok"; grantId: string; expiresAtUtc: string; cidr: string }
  | { kind: "vault_unreachable" }
  | { kind: "vault_disabled" } // 404 allowlist_admin_disabled
  | { kind: "auth_failed" } // HMAC mismatch / Date skew on the vault
  | { kind: "validation_failed"; error: string }
  | { kind: "replay_detected" }
  | { kind: "caddy_reflect_failed" }
  | { kind: "exceeds_max_grant_duration" };
