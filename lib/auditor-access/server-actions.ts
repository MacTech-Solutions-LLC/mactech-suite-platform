"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { emitAuditorAccessEvent } from "./audit-emit";
import { getVaultAdminClient } from "./vault-admin-client";
import {
  ACCEPTED_NETWORK_CLASSIFICATIONS,
  MAX_GRANT_HOURS,
  type NetworkClassificationCode,
} from "./constants";
import type { GrantOutcome } from "./types";

/** Read the auditor's source IP from the inbound request. Returns the
 *  first hop in x-forwarded-for, falling back to x-real-ip. Empty string
 *  if neither is set (local dev). */
export async function detectAuditorIp(): Promise<{ ip: string; ipVersion: 4 | 6 | null }> {
  const h = headers();
  const xff = h.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  return { ip, ipVersion: ipVersionOf(ip) };
}

function ipVersionOf(ip: string): 4 | 6 | null {
  if (!ip) return null;
  if (ip.includes(":")) return 6;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return 4;
  return null;
}

function toCidr(ip: string, version: 4 | 6): string {
  return `${ip}/${version === 4 ? 32 : 128}`;
}

export interface RequestGrantInput {
  ip: string;
  classification: NetworkClassificationCode;
  reason: string;
  durationHours: number;
}

export async function requestGrantAction(input: RequestGrantInput): Promise<GrantOutcome> {
  const ctx = await requireAuthContext();

  const allowed =
    ctx.permissions.includes(PLATFORM_PERMISSIONS.VAULT_ALLOWLIST_REQUEST) ||
    ctx.permissions.includes(PLATFORM_PERMISSIONS.SETTINGS_MANAGE); // super-admin
  if (!allowed) {
    return { kind: "validation_failed", error: "permission_denied" };
  }

  const ipVersion = ipVersionOf(input.ip);
  if (!ipVersion) {
    return { kind: "validation_failed", error: "ip_invalid" };
  }
  if (!(ACCEPTED_NETWORK_CLASSIFICATIONS as readonly string[]).includes(input.classification)) {
    return { kind: "validation_failed", error: "classification_refused" };
  }
  if (!(input.durationHours > 0 && input.durationHours <= MAX_GRANT_HOURS)) {
    return { kind: "validation_failed", error: "duration_invalid" };
  }
  const reason = input.reason.trim();
  if (reason.length < 4) {
    return { kind: "validation_failed", error: "reason_required" };
  }

  const grantId = randomUUID();
  const requestId = randomUUID();
  const expiresAtUtc = new Date(Date.now() + input.durationHours * 3_600_000).toISOString();
  const cidr = toCidr(input.ip, ipVersion);

  const h = headers();
  const ua = h.get("user-agent");

  // ── 1. local audit row: "request placed" ──────────────────────────────
  await emitAuditorAccessEvent({
    eventType: "auditor_access.grant.requested",
    severity: "info",
    action: `Auditor requested vault grant for ${cidr} (${input.classification}, ${input.durationHours}h)`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    ipAddress: input.ip,
    userAgent: ua,
    requestId,
    resourceId: null,
    metadata: {
      grant_id: grantId,
      cidr,
      ip_version: ipVersion,
      network_classification: input.classification,
      duration_hours: input.durationHours,
      reason,
    },
  });

  // ── 2. forward to vault admin endpoint ───────────────────────────────
  const client = getVaultAdminClient();
  if (!client) {
    await emitAuditorAccessEvent({
      eventType: "auditor_access.grant.failed",
      severity: "warning",
      action: "Vault admin endpoint not configured (missing env vars)",
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      ipAddress: input.ip,
      userAgent: ua,
      requestId,
      resourceId: null,
      metadata: { grant_id: grantId, reason_code: "client_unconfigured" },
    });
    return { kind: "vault_unreachable" };
  }

  const result = await client.createGrant({
    grantId,
    requestId,
    cidr,
    ipVersion,
    networkClassification: input.classification as Exclude<NetworkClassificationCode, "unknown_or_shared">,
    reason,
    grantedTo: { clerkUserId: ctx.clerkUserId, email: ctx.userProfile.email },
    expiresAtUtc,
  });

  if (!result.ok) {
    const reason_code =
      result.reason === "unreachable"
        ? "vault_unreachable"
        : result.data?.error ?? `http_${result.status}`;
    await emitAuditorAccessEvent({
      eventType: "auditor_access.grant.failed",
      severity: "warning",
      action: `Vault grant failed: ${reason_code}`,
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      ipAddress: input.ip,
      userAgent: ua,
      requestId,
      resourceId: null,
      metadata: { grant_id: grantId, reason_code, http_status: result.status },
    });
    if (result.reason === "unreachable") return { kind: "vault_unreachable" };
    if (result.status === 401) return { kind: "auth_failed" };
    if (result.status === 404 && result.data?.error === "allowlist_admin_disabled") {
      return { kind: "vault_disabled" };
    }
    if (result.status === 409 && result.data?.error === "replay_detected") {
      return { kind: "replay_detected" };
    }
    if (result.data?.error === "caddy_reflect_failed") {
      return { kind: "caddy_reflect_failed" };
    }
    if (result.data?.error === "exceeds_max_grant_duration") {
      return { kind: "exceeds_max_grant_duration" };
    }
    return { kind: "validation_failed", error: result.data?.error ?? "vault_error" };
  }

  await emitAuditorAccessEvent({
    eventType: "auditor_access.grant.created",
    severity: "warning", // notable security-relevant action
    action: `Vault grant created for ${cidr}, expires ${expiresAtUtc}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    ipAddress: input.ip,
    userAgent: ua,
    requestId,
    resourceId: grantId,
    metadata: {
      grant_id: grantId,
      cidr,
      ip_version: ipVersion,
      network_classification: input.classification,
      duration_hours: input.durationHours,
      expires_at_utc: expiresAtUtc,
      reason,
    },
  });

  revalidatePath("/auditor-access");
  return { kind: "ok", grantId, expiresAtUtc, cidr };
}

export async function revokeGrantAction(grantId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireAuthContext();
  const allowed =
    ctx.permissions.includes(PLATFORM_PERMISSIONS.VAULT_ALLOWLIST_REQUEST) ||
    ctx.permissions.includes(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);
  if (!allowed) return { ok: false, error: "permission_denied" };

  const requestId = randomUUID();
  const h = headers();
  const client = getVaultAdminClient();
  if (!client) {
    return { ok: false, error: "vault_unreachable" };
  }

  const result = await client.revokeGrant(grantId, {
    requestId,
    actorEmail: ctx.userProfile.email,
  });

  await emitAuditorAccessEvent({
    eventType: "auditor_access.grant.revoked",
    severity: "info",
    action: result.ok
      ? `Auditor manually revoked vault grant ${grantId}`
      : `Auditor revoke failed for ${grantId}`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId,
    resourceId: grantId,
    metadata: result.ok ? {} : { reason_code: result.reason },
  });

  if (!result.ok) {
    return { ok: false, error: result.reason };
  }

  revalidatePath("/auditor-access");
  return { ok: true };
}
