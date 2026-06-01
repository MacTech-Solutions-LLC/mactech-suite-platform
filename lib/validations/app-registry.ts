import { z } from "zod";

export const AppStatusEnum = z.enum([
  "active",
  "disabled",
  "development",
  "inactive",
  "hidden",
  "suspended",
]);

export const AppCategoryEnum = z.enum([
  "vault",
  "compliance",
  "evidence",
  "capture",
  "reporting",
  "training",
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

// Deleting an app from the registry is destructive (it cascades to
// entitlements, health snapshots, repo links, dependency edges, …) so it is
// gated behind a typed confirmation plus a fresh MFA challenge. `mfaCode` is a
// TOTP or backup code the admin produces from their authenticator; the service
// verifies it against Clerk before the row is removed.
export const deleteAppSchema = z
  .object({
    appKey: z.string().min(2).max(60),
    confirmAppKey: z.string().min(1),
    mfaCode: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, ""))
      .pipe(
        z
          .string()
          .min(6, "Enter the 6-digit code from your authenticator (or a backup code).")
          .max(16)
          .regex(/^[a-zA-Z0-9]+$/, "MFA codes contain only letters and numbers."),
      ),
  })
  .refine((data) => data.appKey === data.confirmAppKey, {
    message: "The confirmation does not match the app key.",
    path: ["confirmAppKey"],
  });

export type DeleteAppInput = z.infer<typeof deleteAppSchema>;
