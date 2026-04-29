import { z } from "zod";

export const SUPPORTED_EVENTS = [
  "entitlement.enabled",
  "entitlement.disabled",
  "entitlement.updated",
  "customer_org.created",
  "customer_org.updated",
  "customer_org.suspended",
  "customer_user.invited",
  "customer_user.added",
  "customer_user.removed",
  "customer_user.role_changed",
] as const;

export type SupportedEventName = (typeof SUPPORTED_EVENTS)[number];

export const createWebhookSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
  events: z.array(z.string()).min(1, "Pick at least one event."),
  customerOrganizationId: z.string().optional().nullable(),
  appKey: z.string().max(60).optional().or(z.literal("")),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
