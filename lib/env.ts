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

  // ── Auditor IP-allowlist portal (vault edge) ───────────────────────────
  VAULT_ADMIN_BASE_URL: z.string().optional(),
  VAULT_ADMIN_HMAC_SECRET: z.string().optional(),

  // ── MacTech Command Center ─────────────────────────────────────────────
  // Shared secret protecting POST /api/command-center/sync when called
  // by cron from outside an authenticated browser session.
  COMMAND_CENTER_CRON_SECRET: z.string().optional(),
  // Per-probe HTTP timeout for /api/health and /api/build-info checks.
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  HEALTH_CHECK_USER_AGENT: z.string().default("MacTechCommandCenter/1.0"),
  // Master toggle so the reconciliation worker can be disabled without
  // ripping the cron config out.
  ENABLE_HEALTH_CHECKS: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false"),
  // Sliced in later. Stub'd here so .env.example carries the contract
  // and lib/env.ts type-checks every consumer from day 1.
  ENABLE_GITHUB_SYNC: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  ENABLE_RAILWAY_SYNC: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  ENABLE_AI_SUMMARIES: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  ENABLE_AI_PLANNER: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  /** Slice 5.8: shared secret used by the cron tick endpoint
   *  (POST /api/cron/agent-triggers). Set on Railway + on whatever
   *  scheduler hits the endpoint (Railway cron, GitHub Actions, etc.).
   *  Without this, the cron endpoint refuses every call. */
  CRON_SECRET: z.string().optional(),
  /** Slice 8: Resend API key for outbound team emails (AskAIPanel
   *  + email_team_summary capability). Without it, the email client
   *  no-ops gracefully — the AI narrative still renders in the UI,
   *  but no email is sent. Set RESEND_API_KEY=re_... to activate. */
  RESEND_API_KEY: z.string().optional(),
  /** Slice 8: comma-separated default email recipients for "send to
   *  team" toggles. Defaults to the MacTech ops trio if unset. */
  TEAM_EMAILS: z
    .string()
    .default("patrick@mactechsolutionsllc.com,brian@mactechsolutionsllc.com,james@mactechsolutionsllc.com")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.length > 0),
    ),
  /** Slice 8: From address on outbound team emails. Defaults to a
   *  no-reply on the MacTech domain; override if Resend rejects it
   *  for unverified domain. */
  EMAIL_FROM: z
    .string()
    .default("MacTech Suite <suite@mactechsolutionsllc.com>"),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  RAILWAY_API_TOKEN: z.string().optional(),
  RAILWAY_WEBHOOK_SECRET: z.string().optional(),
  /** Slice 8.1: Railway PROJECT-scoped token for the
   *  "MacTech Solutions" project (services: Postgres + mactech, the
   *  app behind AppRegistry.appKey="mactech-core"). Project tokens
   *  use a Project-Access-Token header instead of Bearer. Routed in
   *  lib/integrations/railway/token-routing.ts. */
  RAILWAY_API_TOKEN_MACTECH: z.string().optional(),
  /** Slice 8.1: Railway WORKSPACE-scoped token for bmacdonald417's
   *  workspace. Currently a duplicate-access credential (his
   *  workspace overlaps with the existing RAILWAY_API_TOKEN's
   *  workspace) — left wired for completeness; ignored by the
   *  current routing because it adds no projects we don't already
   *  see. See issue #55 for context. */
  RAILWAY_API_TOKEN_BMAC: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  /** Slice 13.1: opt-in flag to enable the cross-repo agent. Even
   *  with GITHUB_TOKEN set, the capability refuses unless this is
   *  "true" — guards against an accidental preview deploy gaining
   *  the ability to file `@claude` issues in customer repos. */
  ENABLE_CROSS_REPO_AGENT: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
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

export function commandCenterCronConfigured(): boolean {
  return Boolean(env.COMMAND_CENTER_CRON_SECRET);
}

export function githubSyncConfigured(): boolean {
  return Boolean(env.ENABLE_GITHUB_SYNC && env.GITHUB_TOKEN);
}

export function railwaySyncConfigured(): boolean {
  return Boolean(env.ENABLE_RAILWAY_SYNC && env.RAILWAY_API_TOKEN);
}

export function crossRepoAgentConfigured(): boolean {
  return Boolean(env.ENABLE_CROSS_REPO_AGENT && env.GITHUB_TOKEN);
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
    { key: "COMMAND_CENTER_CRON_SECRET", ok: Boolean(env.COMMAND_CENTER_CRON_SECRET), required: false },
    { key: "GITHUB_TOKEN", ok: Boolean(env.GITHUB_TOKEN), required: false },
    { key: "RAILWAY_API_TOKEN", ok: Boolean(env.RAILWAY_API_TOKEN), required: false },
  ];
}
