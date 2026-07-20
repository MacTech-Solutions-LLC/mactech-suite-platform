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
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().default("/dashboard"),
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().default("/dashboard"),

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
  /** Shared secret protecting the public feedback-ingest route
   *  (POST /api/public/feedback). The UI-Fix Chrome extension sends it as
   *  `Authorization: Bearer <FEEDBACK_INGEST_SECRET>`; the route rejects any
   *  request whose bearer token does not match (timing-safe). Distributed to
   *  the teammates who run the extension. Generate with `openssl rand -hex 32`.
   *  Without it, the ingest route returns 503. */
  FEEDBACK_INGEST_SECRET: z.string().optional(),
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
  /** Project-scoped Railway token for the "CMMC Codex" project,
   *  which hosts the WELCOMETOTHETRIBE/CMMC repo (codex app). The
   *  default workspace token can't see this project, so codex is
   *  routed through this token via APP_TOKEN_OVERRIDES. Project
   *  tokens use the Project-Access-Token header (authStyle="project"). */
  RAILWAY_API_TOKEN_CODEX: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  // MacTech AI / NVIDIA NIM. External inference remains opt-in even when a
  // key is configured so preview environments cannot send data accidentally.
  AI_ENABLED: z.string().default("false").transform((v) => v.toLowerCase() === "true"),
  AI_PROVIDER: z.enum(["nvidia", "mock"]).default("mock"),
  AI_EXTERNAL_INFERENCE_ENABLED: z.string().default("false").transform((v) => v.toLowerCase() === "true"),
  AI_DEVELOPMENT_MODE: z.string().default("false").transform((v) => v.toLowerCase() === "true"),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_CHAT_MODEL: z.string().optional(),
  NVIDIA_EMBEDDING_MODEL: z.string().optional(),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().positive().max(100000).default(16000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(8192).default(1200),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(30000),
  AI_ALLOWED_CLASSIFICATIONS: z.string().default("PUBLIC,INTERNAL"),
  AI_STORE_CONVERSATION_CONTENT: z.string().default("false").transform((v) => v.toLowerCase() === "true"),
  AI_AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  AI_MAX_RETRIEVAL_CHUNKS: z.coerce.number().int().positive().max(20).default(5),
  OPPORTUNITIES_BASE_URL: z.string().url().optional(),
  PROPOSAL_BASE_URL: z.string().url().optional(),
  /** Slice 13.1: opt-in flag to enable the cross-repo agent. Even
   *  with GITHUB_TOKEN set, the capability refuses unless this is
   *  "true" — guards against an accidental preview deploy gaining
   *  the ability to file `@claude` issues in customer repos. */
  ENABLE_CROSS_REPO_AGENT: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  /** Sprint 41: opt-in autonomous crash-fix loop. When true, the
   *  reconciliation orchestrator + Railway webhook handler auto-
   *  file @claude fix issues whenever a tracked deploy crashes or
   *  the page-render probe sees an SSR application_error sentinel.
   *  Default OFF — flipping this turns the Suite into a live
   *  closed-loop self-healing system. */
  AUTO_FILE_CRASH_FIXES: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),

  // ── QuickBooks Online (commerce + recurring billing) ───────────────────
  /** OAuth 2.0 client credentials issued by Intuit for the MacTech app. */
  QBO_CLIENT_ID: z.string().optional(),
  QBO_CLIENT_SECRET: z.string().optional(),
  /** Absolute URL Intuit redirects back to after the consent screen.
   *  Must match exactly what's registered in the Intuit developer console
   *  (e.g. https://suite.mactechsolutionsllc.com/api/integrations/quickbooks/callback). */
  QBO_REDIRECT_URI: z.string().url().optional(),
  /** Webhook verifier token from the Intuit app's Webhooks tab. Used to
   *  validate the X-Intuit-Signature HMAC on inbound webhook POSTs. */
  QBO_WEBHOOK_VERIFIER_TOKEN: z.string().optional(),
  /** Which Intuit environment we point at. Sandbox uses sandbox-quickbooks.api.intuit.com
   *  for API calls and Intuit's sandbox OAuth host; production uses the live hosts. */
  QBO_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  /** 32-byte key (hex, base64, or raw) used as the AES-256-GCM key that
   *  encrypts QBO access + refresh tokens at rest. Generate with
   *  `openssl rand -base64 32`. Rotate by re-running the OAuth flow. */
  QBO_ENCRYPTION_KEY: z.string().optional(),

  // ── Commercial Operations (marketing-site → Hub → QBO → provisioning) ──
  /** Shared HMAC secret the marketing site uses to sign POSTs to
   *  /api/checkout/sessions and /api/public/intake. The header
   *  X-Mactech-Signature is sha256(secret + raw body). Without this,
   *  the endpoints refuse every request — never a wide-open public API. */
  MARKETING_SITE_HMAC_SECRET: z.string().optional(),
  /** Clerk user ID of the bot/service account that gets attributed as
   *  the creator of auto-provisioned Clerk orgs and the inviter on
   *  customer invitations. Typically a MacTech super admin's clerkUserId.
   *  Required for the post-payment provisioning flow. */
  SYSTEM_PROVISIONER_CLERK_USER_ID: z.string().optional(),
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

/**
 * Name of the seeded ApiKey row that carries the legacy env var's hash.
 * Written by prisma/seed.ts; read by /admin/api-keys to report whether the
 * legacy key still works. The env var itself no longer grants access — only
 * this row's status does.
 */
export const LEGACY_ENV_KEY_NAME = "legacy:AUDIT_INGEST_API_KEY";

/**
 * Whether AUDIT_INGEST_API_KEY is set in this environment. Note this reports
 * only that the var is *present*, not that it grants anything: the auth
 * fallback was removed (see lib/api-auth.ts). To decide whether the legacy key
 * is still usable, check the status of the `LEGACY_ENV_KEY_NAME` row instead.
 */
export function auditIngestionConfigured(): boolean {
  return Boolean(env.AUDIT_INGEST_API_KEY);
}

export function commandCenterCronConfigured(): boolean {
  return Boolean(env.COMMAND_CENTER_CRON_SECRET);
}

/** True when the public feedback-ingest route can authenticate the
 *  UI-Fix extension. Without it, POST /api/public/feedback returns 503. */
export function feedbackIngestConfigured(): boolean {
  return Boolean(env.FEEDBACK_INGEST_SECRET);
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

/** True when the QBO OAuth handshake can be initiated end-to-end. */
export function quickbooksOauthConfigured(): boolean {
  return Boolean(
    env.QBO_CLIENT_ID &&
      env.QBO_CLIENT_SECRET &&
      env.QBO_REDIRECT_URI &&
      env.QBO_ENCRYPTION_KEY,
  );
}

/** True when inbound QBO webhook signatures can be verified. */
export function quickbooksWebhookConfigured(): boolean {
  return Boolean(env.QBO_WEBHOOK_VERIFIER_TOKEN);
}

/** True when the marketing-site public APIs can verify caller signatures. */
export function marketingSiteHmacConfigured(): boolean {
  return Boolean(env.MARKETING_SITE_HMAC_SECRET);
}

/** True when auto-provisioning has a Clerk creator/inviter identity. */
export function systemProvisionerConfigured(): boolean {
  return Boolean(env.SYSTEM_PROVISIONER_CLERK_USER_ID);
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
    { key: "QBO_CLIENT_ID", ok: Boolean(env.QBO_CLIENT_ID), required: false },
    { key: "QBO_CLIENT_SECRET", ok: Boolean(env.QBO_CLIENT_SECRET), required: false },
    { key: "QBO_REDIRECT_URI", ok: Boolean(env.QBO_REDIRECT_URI), required: false },
    {
      key: "QBO_WEBHOOK_VERIFIER_TOKEN",
      ok: Boolean(env.QBO_WEBHOOK_VERIFIER_TOKEN),
      required: false,
    },
    { key: "QBO_ENCRYPTION_KEY", ok: Boolean(env.QBO_ENCRYPTION_KEY), required: false },
  ];
}
