/**
 * Example client for submitting audit logs to Hub audit ingestion
 * from another MacTech app.
 *
 * Usage in a sibling app (CUI Vault, Evidence Engine, etc.):
 *
 *   import { sendAuditLog } from "@mactech/identity-audit-client";
 *
 *   await sendAuditLog({
 *     baseUrl: process.env.MACTECH_IDENTITY_BASE_URL,
 *     apiKey: process.env.MACTECH_AUDIT_INGEST_API_KEY,
 *     payload: {
 *       appKey: "cui-vault",
 *       eventType: "vault.file.downloaded",
 *       eventCategory: "vault",
 *       severity: "info",
 *       action: "downloaded encrypted CUI file",
 *       customerOrgClerkId: clerkOrgId,
 *       actorClerkUserId: clerkUserId,
 *       resourceType: "vault_file",
 *       resourceId: fileId,
 *       metadata: { sizeBytes: 102400 },
 *     },
 *   });
 *
 * The shape mirrors `lib/validations/audit.ts > auditIngestSchema`.
 * Keep this file dependency-free so apps can copy or adapt it.
 */

export interface AuditIngestPayload {
  sourceAppKey: string;
  appKey?: string;
  eventType: string;
  eventCategory:
    | "auth"
    | "user"
    | "org"
    | "entitlement"
    | "role"
    | "security"
    | "vault"
    | "evidence"
    | "boundary"
    | "capture"
    | "system";
  severity?: "info" | "warning" | "critical";
  action: string;
  actorHubUserId?: string;
  customerOrgId?: string;
  organizationId?: string;
  tenantOrgId?: string;
  customerOrgClerkId?: string;
  actorClerkUserId?: string;
  actorEmail?: string;
  objectType?: string;
  objectId?: string;
  objectVersion?: string;
  objectHash?: string;
  suiteObjectReferenceId?: string;
  resourceType?: string;
  resourceId?: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export interface SendAuditLogOptions {
  baseUrl: string;
  apiKey: string;
  payload: AuditIngestPayload;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function sendAuditLog(opts: SendAuditLogOptions) {
  const { baseUrl, apiKey, payload, fetchImpl = fetch, signal } = opts;
  const url = new URL("/api/hub/audit/events", baseUrl).toString();
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MacTech-Service-Token": apiKey,
      "X-MacTech-Source-App": payload.sourceAppKey,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`audit/ingest failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{
    id: string;
    ok: true;
    sequenceNumber: number;
    currentHash: string;
  }>;
}
