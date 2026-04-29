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
  appKey: z.string().min(1).max(60),
  eventType: z.string().min(1).max(120),
  eventCategory: AuditCategoryEnum.default("system"),
  severity: AuditSeverityEnum.default("info"),
  action: z.string().min(1).max(500),
  customerOrgId: z.string().optional().nullable(),
  customerOrgClerkId: z.string().optional().nullable(),
  actorClerkUserId: z.string().optional().nullable(),
  actorEmail: z.string().email().optional().nullable(),
  resourceType: z.string().max(120).optional().nullable(),
  resourceId: z.string().max(200).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  requestId: z.string().max(120).optional().nullable(),
});

export type AuditIngestInput = z.infer<typeof auditIngestSchema>;
