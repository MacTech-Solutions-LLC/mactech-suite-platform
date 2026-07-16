import { z } from "zod";

export const ApiKeyScopeEnum = z.enum([
  "audit_ingest",
  "org_read",
  "user_access_read",
  "app_authority_resolve",
  "object_reference_write",
  "webhook_send",
  "agents_trigger",
  "contract_read",
  "contract_write",
  "profile_read",
  "profile_write",
]);

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  scopes: z.array(ApiKeyScopeEnum).min(1, "Pick at least one scope."),
  appKey: z.string().max(60).optional().or(z.literal("")),
  expiresAt: z.coerce.date().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
