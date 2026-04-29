import { z } from "zod";

export const EntitlementPlanEnum = z.enum([
  "none",
  "trial",
  "starter",
  "professional",
  "enterprise",
  "custom",
]);

export const EntitlementStatusEnum = z.enum([
  "active",
  "trialing",
  "expired",
  "suspended",
]);

export const upsertEntitlementSchema = z.object({
  customerOrganizationId: z.string().min(1),
  appRegistryId: z.string().min(1),
  enabled: z.boolean(),
  plan: EntitlementPlanEnum.default("none"),
  maxUsers: z.coerce.number().int().min(0).max(100000).optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  status: EntitlementStatusEnum.default("active"),
  configurationJson: z.unknown().optional(),
});

export type UpsertEntitlementInput = z.infer<typeof upsertEntitlementSchema>;

/** Lightweight schema for the matrix-cell toggle. Sensible defaults applied
 *  server-side so the UI doesn't need to know about plans/status. */
export const quickToggleEntitlementSchema = z.object({
  customerOrganizationId: z.string().min(1),
  appRegistryId: z.string().min(1),
  enabled: z.boolean(),
});

export type QuickToggleEntitlementInput = z.infer<typeof quickToggleEntitlementSchema>;

/** Bulk-enable / bulk-disable entitlements for one org across many apps. */
export const bulkSetEntitlementsSchema = z.object({
  customerOrganizationId: z.string().min(1),
  appRegistryIds: z.array(z.string().min(1)).min(1).max(50),
  enabled: z.boolean(),
});

export type BulkSetEntitlementsInput = z.infer<typeof bulkSetEntitlementsSchema>;
