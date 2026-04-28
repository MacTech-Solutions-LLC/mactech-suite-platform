import { z } from "zod";

export const SecuritySeverityEnum = z.enum(["low", "medium", "high", "critical"]);
export const SecurityEventStatusEnum = z.enum([
  "open",
  "investigating",
  "resolved",
  "ignored",
]);

export const updateSecurityEventStatusSchema = z.object({
  id: z.string().min(1),
  status: SecurityEventStatusEnum,
  note: z.string().max(2000).optional(),
});

export type UpdateSecurityEventStatusInput = z.infer<
  typeof updateSecurityEventStatusSchema
>;
