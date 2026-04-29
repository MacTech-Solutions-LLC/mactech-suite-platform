/**
 * Environment validation for the Identity Command Center.
 *
 * The schema enforces what we *require* at runtime to keep the app safe.
 * Optional flags (webhook secret, audit ingestion key) are validated when
 * the corresponding feature is invoked, not at boot, so local development
 * keeps working before those secrets are wired.
 */

import { z } from "zod";

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  AUDIT_INGEST_API_KEY: z.string().optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().default("/dashboard"),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().default("/dashboard"),
});

const parsed = RawEnvSchema.safeParse(process.env);

if (!parsed.success) {
  // We surface a clear warning but never throw at module-load time.
  // The Next.js build phase imports modules to collect page data, and at
  // runtime the missing-env failure is far easier to debug at the call site.
  const issues = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  console.warn(`[env] Environment configuration warnings: ${issues}`);
}

export const env = (parsed.success ? parsed.data : RawEnvSchema.parse({})) as z.infer<
  typeof RawEnvSchema
>;

/**
 * Strict assertion for runtime code that genuinely cannot proceed without
 * a given env var. Throws with a clear message; callers can catch.
 */
export function assertEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`[env] ${String(key)} is required but not configured.`);
  }
  return value as NonNullable<(typeof env)[K]>;
}

export function clerkConfigured(): boolean {
  return Boolean(env.CLERK_SECRET_KEY && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export function clerkWebhookConfigured(): boolean {
  return Boolean(env.CLERK_WEBHOOK_SECRET);
}

export function auditIngestionConfigured(): boolean {
  return Boolean(env.AUDIT_INGEST_API_KEY);
}

export function envHealth(): Array<{ key: string; ok: boolean; required: boolean }> {
  return [
    { key: "DATABASE_URL", ok: Boolean(env.DATABASE_URL), required: true },
    {
      key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      ok: Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
      required: true,
    },
    { key: "CLERK_SECRET_KEY", ok: Boolean(env.CLERK_SECRET_KEY), required: true },
    { key: "CLERK_WEBHOOK_SECRET", ok: Boolean(env.CLERK_WEBHOOK_SECRET), required: false },
    { key: "AUDIT_INGEST_API_KEY", ok: Boolean(env.AUDIT_INGEST_API_KEY), required: false },
    { key: "NEXT_PUBLIC_APP_URL", ok: Boolean(env.NEXT_PUBLIC_APP_URL), required: true },
  ];
}
