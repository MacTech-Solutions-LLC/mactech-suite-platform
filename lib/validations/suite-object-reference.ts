import { z } from "zod";
import { SUPPORTED_SUITE_OBJECT_TYPES } from "@/lib/suite-object-reference-core";

const metadataSchema = z.record(z.string(), z.unknown()).optional().nullable();
const sourceAppKeySchema = z.string().min(1).max(80);

export const createSuiteObjectReferenceSchema = z.object({
  sourceAppKey: sourceAppKeySchema.optional().nullable(),
  owningAppKey: z.string().min(1).max(80),
  objectType: z.enum(SUPPORTED_SUITE_OBJECT_TYPES),
  objectId: z.string().min(1).max(300),
  objectVersion: z.string().min(1).max(200).optional().nullable(),
  objectHash: z.string().min(16).max(256).optional().nullable(),
  tenantOrgId: z.string().min(1).max(200).optional().nullable(),
  organizationId: z.string().min(1).max(200).optional().nullable(),
  createdByHubUserId: z.string().min(1).max(200).optional().nullable(),
  metadataJson: metadataSchema,
  metadata: metadataSchema,
});

export const verifySuiteObjectReferenceSchema = z.object({
  id: z.string().min(1).max(200),
  sourceAppKey: sourceAppKeySchema.optional().nullable(),
  verificationStatus: z.enum(["pending", "verified", "failed"]).optional().nullable(),
  objectHash: z.string().min(16).max(256).optional().nullable(),
  metadataJson: metadataSchema,
  metadata: metadataSchema,
});

export const deprecateSuiteObjectReferenceSchema = z.object({
  sourceAppKey: sourceAppKeySchema.optional().nullable(),
  replacedByReferenceId: z.string().min(1).max(200),
  metadataJson: metadataSchema,
  metadata: metadataSchema,
});

export function validationIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
