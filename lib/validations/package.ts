import { z } from "zod";

export const BillingCycleEnum = z.enum(["one_time", "monthly", "quarterly", "annually"]);
export const PackageStatusEnum = z.enum(["draft", "active", "archived"]);
export const EntitlementTierEnum = z.enum([
  "starter",
  "professional",
  "enterprise",
  "federal",
]);

export const upsertPackageSchema = z.object({
  id: z.string().cuid().optional(),
  sku: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, {
      message: "Use lowercase letters, numbers, and hyphens (e.g. starter-monthly).",
    }),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  /** Price in whole-currency units (e.g. dollars). Converted to cents on
   *  insert so the schema field stays an integer. */
  priceMajor: z.coerce.number().nonnegative().max(1_000_000),
  currency: z.string().length(3).default("USD"),
  billingCycle: BillingCycleEnum,
  entitlementTier: EntitlementTierEnum.default("starter"),
  includedAppKeys: z.array(z.string()).default([]),
  status: PackageStatusEnum.default("draft"),
});

export type UpsertPackageInput = z.infer<typeof upsertPackageSchema>;
