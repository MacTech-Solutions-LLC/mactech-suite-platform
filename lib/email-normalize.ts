/**
 * Clerk normalizes email addresses to lowercase before delivering
 * webhooks. UserProfile.email is `@unique` and Postgres compares
 * text case-SENSITIVELY, so any write path that uses the operator's
 * raw input would silently create a duplicate row when the user later
 * accepts a Clerk invitation. Every write path that persists an email
 * must go through this helper.
 *
 * Lives in its own file because the consumers include both server
 * actions (lib/services/user-service.ts, "use server") and plain
 * server modules (lib/services/clerk-sync-service.ts, lib/authz.ts).
 * A "use server" module can only export async functions; this is
 * a sync utility, so it has to live elsewhere.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
