import { z } from "zod";

export const AppStatusEnum = z.enum(["active", "disabled", "development"]);

export const AppCategoryEnum = z.enum([
  "vault",
  "compliance",
  "evidence",
  "capture",
  "reporting",
  "admin",
  "other",
]);

export const upsertAppSchema = z.object({
  appKey: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, {
      message:
        "Use lowercase letters, numbers, and hyphens (e.g. cui-vault).",
    }),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  baseUrl: z.string().url().optional().or(z.literal("")),
  category: AppCategoryEnum.default("other"),
  status: AppStatusEnum.default("development"),
  requiresOrgContext: z.boolean().default(true),
  isInternalOnly: z.boolean().default(false),
});

export type UpsertAppInput = z.infer<typeof upsertAppSchema>;
