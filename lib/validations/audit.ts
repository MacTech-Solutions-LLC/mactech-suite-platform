import { z } from "zod";

export const AuditCategoryEnum = z.enum([
  "auth",
  "user",
  "org",
  "entitlement",
  "role",
  "security",
  "vault",
  "evidence",
  "boundary",
  "capture",
  "system",
]);

export const AuditSeverityEnum = z.enum(["info", "warning", "critical"]);

export const auditIngestSchema = z.object({
  appKey: z.string().min(1).max(60).optional(),
  sourceAppKey: z.string().min(1).max(60).optional(),
  eventType: z.string().min(1).max(120),
  // .catch(): an unrecognized category/severity from a sibling app degrades to
  // the fallback instead of rejecting the whole event (mirrors
  // normalizeAuditCategory/normalizeAuditSeverity in lib/hub-audit.ts).
  eventCategory: AuditCategoryEnum.default("system").catch("system"),
  severity: AuditSeverityEnum.default("info").catch("info"),
  action: z.string().min(1).max(500),
  actorHubUserId: z.string().optional().nullable(),
  actorServiceId: z.string().optional().nullable(),
  organizationId: z.string().optional().nullable(),
  tenantOrgId: z.string().optional().nullable(),
  customerOrgId: z.string().optional().nullable(),
  customerOrgClerkId: z.string().optional().nullable(),
  actorClerkUserId: z.string().optional().nullable(),
  actorEmail: z.string().email().optional().nullable(),
  objectType: z.string().max(120).optional().nullable(),
  objectId: z.string().max(200).optional().nullable(),
  objectVersion: z.string().max(120).optional().nullable(),
  objectHash: z.string().max(200).optional().nullable(),
  suiteObjectReferenceId: z.string().optional().nullable(),
  resourceType: z.string().max(120).optional().nullable(),
  resourceId: z.string().max(200).optional().nullable(),
  beforeJson: z.unknown().optional().nullable(),
  afterJson: z.unknown().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  metadataJson: z.record(z.string(), z.unknown()).optional().nullable(),
  requestId: z.string().max(120).optional().nullable(),
}).superRefine((value, ctx) => {
  if (!value.appKey && !value.sourceAppKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceAppKey"],
      message: "sourceAppKey or appKey is required.",
    });
  }
});

export type AuditIngestInput = z.infer<typeof auditIngestSchema>;
