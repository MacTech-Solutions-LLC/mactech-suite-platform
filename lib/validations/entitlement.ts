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
