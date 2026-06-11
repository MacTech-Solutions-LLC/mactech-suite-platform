/**
 * Hub ApiKey issuer for satellite live authority cutover (ops tooling).
 *
 * Issues a scoped ApiKey for a satellite `appKey` — mirrors manual issuance
 * via /admin/api-keys. Plaintext token is printed once to stdout; never
 * written to disk or committed to git.
 *
 * Usage:
 *   railway run npx tsx scripts/issue-app-hub-token.ts <appKey> [options]
 *
 * Requires DATABASE_URL in the environment (no hardcoded connection strings).
 */

import { createHash, randomBytes } from "crypto";
import { PrismaClient, type ApiKeyScope } from "@prisma/client";

const KEY_PREFIX = "mts_";
const KEY_BYTE_LENGTH = 24;

const DEFAULT_SCOPES: ApiKeyScope[] = ["app_authority_resolve", "audit_ingest"];

const VALID_SCOPES: readonly ApiKeyScope[] = [
  "audit_ingest",
  "org_read",
  "user_access_read",
  "app_authority_resolve",
  "object_reference_write",
  "webhook_send",
  "agents_trigger",
];

type CliOptions = {
  appKey: string | null;
  scopes: ApiKeyScope[];
  dryRun: boolean;
  help: boolean;
  name: string | null;
  description: string | null;
};

function sha256(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function generateKey(): { plaintext: string; hash: string; prefix: string } {
  const random = randomBytes(KEY_BYTE_LENGTH).toString("hex");
  const plaintext = `${KEY_PREFIX}${random}`;
  return {
    plaintext,
    hash: sha256(plaintext),
    prefix: plaintext.slice(0, 12),
  };
}

function printHelp(): void {
  console.log(`issue-app-hub-token — issue a Hub ApiKey for a satellite appKey

USAGE
  npx tsx scripts/issue-app-hub-token.ts <appKey> [options]

  With Railway-linked Hub database (Brian-operable):
  railway run npx tsx scripts/issue-app-hub-token.ts <appKey> [options]

OPTIONS
  --help, -h           Show this help and exit
  --dry-run            Validate prerequisites; print planned key metadata only
  --scopes <list>      Comma-separated scopes (default: app_authority_resolve,audit_ingest)
  --name <string>      ApiKey display name (default: "<appKey> live authority (YYYY-MM-DD)")
  --description <text> Optional ApiKey description

ENVIRONMENT
  DATABASE_URL         Required. Hub Postgres connection string.

EXAMPLES
  npx tsx scripts/issue-app-hub-token.ts bizops
  npx tsx scripts/issue-app-hub-token.ts bizops --dry-run
  npx tsx scripts/issue-app-hub-token.ts bizops --scopes app_authority_resolve

OUTPUT
  On success, prints a single JSON line to stdout containing the plaintext
  token exactly once. Copy it immediately to Railway as MACTECH_HUB_SERVICE_TOKEN.
  Do not paste tokens in PRs, chat, or git.

See docs/HUB_SERVICE_TOKEN_ISSUANCE.md for prerequisites and rotation.
`);
}

function parseScopes(raw: string): ApiKeyScope[] | null {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  for (const scope of parts) {
    if (!VALID_SCOPES.includes(scope as ApiKeyScope)) {
      console.error(`Unknown scope: ${scope}`);
      console.error(`Valid scopes: ${VALID_SCOPES.join(", ")}`);
      return null;
    }
  }
  return parts as ApiKeyScope[];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    appKey: null,
    scopes: [...DEFAULT_SCOPES],
    dryRun: false,
    help: false,
    name: null,
    description: null,
  };

  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--scopes") {
      const next = argv[++i];
      if (!next) {
        console.error("--scopes requires a comma-separated value");
        process.exit(1);
      }
      const parsed = parseScopes(next);
      if (!parsed) process.exit(1);
      options.scopes = parsed;
      continue;
    }
    if (arg === "--name") {
      const next = argv[++i];
      if (!next) {
        console.error("--name requires a value");
        process.exit(1);
      }
      options.name = next;
      continue;
    }
    if (arg === "--description") {
      const next = argv[++i];
      if (!next) {
        console.error("--description requires a value");
        process.exit(1);
      }
      options.description = next;
      continue;
    }
    if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      console.error("Run with --help for usage.");
      process.exit(1);
    }
    positional.push(arg);
  }

  if (positional.length > 0) {
    options.appKey = positional[0];
  }
  if (positional.length > 1) {
    console.error("Unexpected positional arguments:", positional.slice(1).join(" "));
    process.exit(1);
  }

  return options;
}

function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required. Set it in the environment before running.");
    console.error("Example: railway run npx tsx scripts/issue-app-hub-token.ts <appKey>");
    process.exit(1);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  requireDatabaseUrl();

  if (!options.appKey) {
    console.error("Missing required <appKey> argument.");
    console.error("Run with --help for usage.");
    process.exit(1);
  }

  const appKey = options.appKey;
  const prisma = new PrismaClient();
  const today = new Date().toISOString().slice(0, 10);
  const keyName =
    options.name ?? `${appKey} live authority (${today})`;
  const keyDescription =
    options.description ??
    `Ops script — scopes [${options.scopes.join(", ")}] for ${appKey}`;

  try {
    const [registry, serviceIdentity] = await Promise.all([
      prisma.appRegistry.findUnique({ where: { appKey } }),
      prisma.serviceIdentity.findUnique({ where: { appKey } }),
    ]);

    if (!registry) {
      console.error(`AppRegistry row not found for appKey: ${appKey}`);
      console.error("Create or seed the AppRegistry row before issuing a token.");
      process.exit(1);
    }

    if (registry.status !== "active") {
      console.error(
        `AppRegistry status for ${appKey} is "${registry.status}" — expected "active".`,
      );
      console.error("Set status to active in Hub admin before issuing a live pilot token.");
      process.exit(1);
    }

    if (!serviceIdentity) {
      console.error(`ServiceIdentity not found for appKey: ${appKey}`);
      console.error("Run db:seed or create the ServiceIdentity row before issuing a token.");
      process.exit(1);
    }

    if (serviceIdentity.status !== "active") {
      console.error(
        `ServiceIdentity status for ${appKey} is "${serviceIdentity.status}" — expected "active".`,
      );
      process.exit(1);
    }

    if (options.dryRun) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            appKey,
            appRegistryStatus: registry.status,
            serviceIdentityStatus: serviceIdentity.status,
            planned: {
              name: keyName,
              description: keyDescription,
              scopes: options.scopes,
              status: "active",
            },
          },
          null,
          2,
        ),
      );
      return;
    }

    const { plaintext, hash, prefix } = generateKey();

    const row = await prisma.apiKey.create({
      data: {
        name: keyName,
        description: keyDescription,
        scopes: options.scopes,
        appKey,
        keyHash: hash,
        keyPrefix: prefix,
        status: "active",
      },
    });

    console.error(
      "WARNING: Copy the token below to Railway as MACTECH_HUB_SERVICE_TOKEN now.",
    );
    console.error("Plaintext is shown once and cannot be recovered from Hub.");
    console.error("Do not commit, log to file, or paste in PR/chat.\n");

    console.log(
      JSON.stringify({
        id: row.id,
        appKey,
        prefix: row.keyPrefix,
        scopes: row.scopes,
        name: row.name,
        token: plaintext,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
