import { z } from "zod";
import { API_KEY_SCOPE_VALUES } from "@/lib/api-key-scopes";

/**
 * Derived from the scope catalog, which is exhaustive over the Prisma enum.
 *
 * #158 caught the same drift and fixed it by typing the five missing values
 * into this list by hand. That works today and re-breaks on the next scope: the
 * list is a copy, and the reason it fell five behind was never that someone
 * couldn't type — it was that nothing told them to. Deriving it means the next
 * scope is a compile error here instead of a validation error in a user's face.
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
