"use server";

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { createApiKeySchema, type CreateApiKeyInput } from "@/lib/validations/api-key";
import type { ApiKeyScope } from "@prisma/client";

const KEY_PREFIX = "mts_";
const KEY_BYTE_LENGTH = 24; // 48 hex chars + 4-char prefix = 52 chars total

function generateKey(): { plaintext: string; hash: string; prefix: string } {
  const random = randomBytes(KEY_BYTE_LENGTH).toString("hex");
  const plaintext = `${KEY_PREFIX}${random}`;
  const hash = sha256(plaintext);
  // Display prefix is the first 12 chars of the plaintext (`mts_xxxxxxxx`).
  const prefix = plaintext.slice(0, 12);
  return { plaintext, hash, prefix };
}

function sha256(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Issue a new API key. Returns the plaintext exactly once — store it on
 * the client side or copy it immediately. After this response, the
 * plaintext is unrecoverable; callers can only see the prefix.
 */
export async function createApiKey(rawInput: CreateApiKeyInput) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);
  const input = createApiKeySchema.parse(rawInput);

  const { plaintext, hash, prefix } = generateKey();

  const row = await prisma.apiKey.create({
    data: {
      name: input.name,
      description: input.description || null,
      scopes: input.scopes as ApiKeyScope[],
      appKey: input.appKey || null,
      expiresAt: input.expiresAt ?? null,
      keyHash: hash,
      keyPrefix: prefix,
      createdById: ctx.userProfile.id,
      status: "active",
    },
  });

  await writeAuditLog({
    eventType: "api_key.created",
    eventCategory: "system",
    severity: "warning",
    action: `Issued API key '${row.name}' (${row.keyPrefix}…) with scopes [${input.scopes.join(", ")}]`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "ApiKey",
    resourceId: row.id,
    metadata: {
      keyPrefix: row.keyPrefix,
      scopes: input.scopes,
      appKey: input.appKey,
      expiresAt: input.expiresAt?.toISOString(),
    },
  });

  return {
    id: row.id,
    name: row.name,
    plaintext, // shown to caller exactly once
    prefix: row.keyPrefix,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
  };
}

/**
 * Sprint 32: rotate an API key. Issues a fresh key with the same
 * name (suffixed with " (rotated)" if not already), description,
 * scopes, appKey, and expiresAt; revokes the old one. Returns the
 * new plaintext exactly once — caller stores or copies immediately.
 *
 * The two writes are not in a transaction because Prisma transactions
 * over revoke + create with hashing have a small race window during
 * which both keys are valid. That's the desired property: the caller
 * has time to swap in the new key before the old one stops working.
 */
export async function rotateApiKey(id: string) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);

  const previous = await prisma.apiKey.findUnique({ where: { id } });
  if (!previous) throw new Error("API key not found.");
  if (previous.status === "revoked") {
    throw new Error("Cannot rotate a revoked key — issue a new key instead.");
  }

  const { plaintext, hash, prefix } = generateKey();
  const newName = previous.name.includes("(rotated")
    ? previous.name
    : `${previous.name} (rotated ${new Date().toISOString().slice(0, 10)})`;

  const next = await prisma.apiKey.create({
    data: {
      name: newName,
      description: previous.description,
      scopes: previous.scopes,
      appKey: previous.appKey,
      expiresAt: previous.expiresAt,
      keyHash: hash,
      keyPrefix: prefix,
      createdById: ctx.userProfile.id,
      status: "active",
    },
  });

  await prisma.apiKey.update({
    where: { id },
    data: { status: "revoked" },
  });

  await writeAuditLog({
    eventType: "api_key.rotated",
    eventCategory: "system",
    severity: "warning",
    action: `Rotated API key '${previous.name}' (${previous.keyPrefix}…) → new key (${next.keyPrefix}…)`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "ApiKey",
    resourceId: next.id,
    metadata: {
      previousId: previous.id,
      previousPrefix: previous.keyPrefix,
      newPrefix: next.keyPrefix,
      scopes: previous.scopes,
    },
  });

  return {
    id: next.id,
    name: next.name,
    plaintext,
    prefix: next.keyPrefix,
    scopes: next.scopes,
    expiresAt: next.expiresAt,
    previousId: previous.id,
  };
}

export async function revokeApiKey(id: string) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.SETTINGS_MANAGE);
  const row = await prisma.apiKey.update({
    where: { id },
    data: { status: "revoked" },
  });
  await writeAuditLog({
    eventType: "api_key.revoked",
    eventCategory: "system",
    severity: "warning",
    action: `Revoked API key '${row.name}' (${row.keyPrefix}…)`,
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "ApiKey",
    resourceId: row.id,
    metadata: { keyPrefix: row.keyPrefix },
  });
  return row;
}

/**
 * Verify a plaintext API key + scope. Returns the key row on success or
 * null on any failure (unknown key, revoked, expired, missing scope).
 *
 * Also updates `lastUsedAt` (best-effort, swallowed errors) so the admin
 * UI can surface "last seen 2 minutes ago".
 */
export async function verifyApiKey(
  plaintext: string,
  scope: ApiKeyScope,
): Promise<{ id: string; name: string; appKey: string | null } | null> {
  if (!plaintext) return null;
  const hash = sha256(plaintext);
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: {
      id: true,
      name: true,
      scopes: true,
      status: true,
      expiresAt: true,
      appKey: true,
    },
  });
  if (!key) return null;
  if (key.status !== "active") return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  if (!key.scopes.includes(scope)) return null;

  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      /* no-op */
    });

  return { id: key.id, name: key.name, appKey: key.appKey };
}
