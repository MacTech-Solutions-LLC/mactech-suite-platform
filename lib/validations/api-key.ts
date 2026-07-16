import { z } from "zod";
import { API_KEY_SCOPE_VALUES } from "@/lib/api-key-scopes";

/**
 * Derived from the scope catalog, which is itself exhaustive over the Prisma
 * enum. This used to be a hand-written list and had fallen five scopes behind —
 * so a key for a scope the platform genuinely uses (contract_read/_write) was
 * rejected here even when the caller asked for it correctly.
 */
export const ApiKeyScopeEnum = z.enum(API_KEY_SCOPE_VALUES);

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  scopes: z.array(ApiKeyScopeEnum).min(1, "Pick at least one scope."),
  appKey: z.string().max(60).optional().or(z.literal("")),
  expiresAt: z.coerce.date().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
