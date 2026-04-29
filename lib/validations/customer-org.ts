import { z } from "zod";

export const CustomerTypeEnum = z.enum([
  "dib",
  "prime",
  "subcontractor",
  "internal",
  "other",
]);

export const CustomerStatusEnum = z.enum([
  "active",
  "onboarding",
  "suspended",
  "archived",
]);

export const SubscriptionTierEnum = z.enum([
  "starter",
  "professional",
  "enterprise",
  "federal",
]);

export const CmmcLevelEnum = z.enum(["level1", "level2", "unknown"]);

export const CuiBoundaryTypeEnum = z.enum([
  "none",
  "vault_only",
  "customer_managed",
  "hybrid",
]);

export const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const createCustomerOrgSchema = z.object({
  name: z.string().min(1).max(120),
  legalName: z.string().max(200).optional().or(z.literal("")),
  domain: z.string().max(120).optional().or(z.literal("")),
  cageCode: z.string().max(20).optional().or(z.literal("")),
  uei: z.string().max(20).optional().or(z.literal("")),
  duns: z.string().max(20).optional().or(z.literal("")),
  industry: z.string().max(120).optional().or(z.literal("")),
  customerType: CustomerTypeEnum.default("other"),
  subscriptionTier: SubscriptionTierEnum.default("starter"),
  cmmcTargetLevel: CmmcLevelEnum.default("unknown"),
  cuiBoundaryType: CuiBoundaryTypeEnum.default("none"),
  primaryContactName: z.string().max(200).optional().or(z.literal("")),
  primaryContactEmail: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
  initialAppKeys: z.array(z.string()).max(20).default([]),
});

export type CreateCustomerOrgInput = z.infer<typeof createCustomerOrgSchema>;

export const updateCustomerOrgSchema = createCustomerOrgSchema
  .omit({ initialAppKeys: true })
  .extend({
    status: CustomerStatusEnum.optional(),
  })
  .partial();

export type UpdateCustomerOrgInput = z.infer<typeof updateCustomerOrgSchema>;
