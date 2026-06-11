# @mactech/hub-client

MacTech Suite Hub authority client for satellite apps. Clerk authenticates sessions; **Hub authorizes** all protected surfaces.

## Install (local dev)

```json
{
  "@mactech/hub-client": "file:../mactech-suite-platform/packages/hub-client"
}
```

Sibling checkout of `mactech-suite-platform` is required. `npm install` runs `prepare` → builds `dist/`.

## Railway build contract (satellite repos)

Satellite apps depend on `@mactech/hub-client` via a `file:` path. Railway git-only builds do not have a sibling checkout, so each satellite provisions hub-client during the build step.

**Platform guarantee (this package):** `typescript`, `@types/node`, and `tsx` are declared `devDependencies`. A clean hub-client directory builds with:

```bash
npm ci && npm run build
```

No per-repo `npm install --no-save typescript @types/node` hacks are required once this package is on `main`.

**Standard satellite `scripts/railway-build.sh`:**

```bash
#!/usr/bin/env bash
set -euo pipefail

HUB_CLIENT="../mactech-suite-platform/packages/hub-client"
if [ ! -d "$HUB_CLIENT" ]; then
  TMPDIR=$(mktemp -d)
  trap 'rm -rf "$TMPDIR"' EXIT
  git clone --depth 1 https://github.com/MacTech-Solutions-LLC/mactech-suite-platform.git "$TMPDIR/mactech-suite-platform"
  mkdir -p ../mactech-suite-platform/packages
  cp -R "$TMPDIR/mactech-suite-platform/packages/hub-client" "$HUB_CLIENT"
fi

(
  cd "$HUB_CLIENT"
  npm ci --ignore-scripts
  npm run build
)

npm install --no-audit --cache /tmp/npm-app-cache
npm run build
```

**Notes:**

- Use `npm ci --ignore-scripts` in the hub-client step so `prepare` does not run before `dist/` exists; then call `npm run build` explicitly.
- Pin `mactech-suite-platform` clone to a ref (branch/tag/SHA) when reproducibility matters; `--depth 1` tracks default branch.
- Pair with `railway.json` `"buildCommand": "bash scripts/railway-build.sh"` and `nixpacks.toml` that skips default install when hub-client must be provisioned first (see greenfield `bizops`, `contracts-delivery`, `client-portal`).
- Full variable and project setup: `mactech-suite-workspace-control/prompts/pre-tenant-speed-mode/RAILWAY_SATELLITE_SETUP.md`.

## Consumer API (Pre-Tenant Speed Mode)

| Export | Purpose |
|---|---|
| `createHubAuthorityClient()` | Factory — `HUB_AUTHORITY_MODE=mock\|live` |
| `createMockHubAuthority()` | Dev/stub adapter with fixtures |
| `createLiveHubAuthorityClient()` | Wraps live `resolveHubAppAccess` |
| `HubAuthorityClient.resolveAppAccess()` | Spec-named consumer entry point |
| `toHubAccessSnapshot()` | Adapter: live `HubAuthoritySnapshot` → `HubAccessSnapshot` |
| `HubAccessSnapshot` | Consumer view (HUB_AUTH_CONTRACT_V1_SPEC §3) |
| `HubAuthoritySnapshot` | **Runtime canonical** shape from live Hub |

**Do not replace runtime types.** `HubAuthoritySnapshot` (flat, signed) remains the live contract per `docs/HUB_AUTHORITY_CONTRACT_V1.md`. `HubAccessSnapshot` is the satellite-friendly adapter view.

## Protected route pattern

1. Read Clerk session (`clerkUserId`, `clerkOrgId`).
2. Call `resolveAppAccess({ appKey, clerkUserId, clerkOrgId, mode })`.
3. If `!snapshot.allowed` → 403.
4. Attach snapshot to request context; domain logic only.

## Mock vs live

```typescript
import { createHubAuthorityClient } from "@mactech/hub-client";

// Mock (default when HUB_AUTHORITY_MODE unset in examples)
const mock = createHubAuthorityClient({ mode: "mock" });

// Live
const live = createHubAuthorityClient({
  mode: "live",
  live: {
    hubBaseUrl: process.env.MACTECH_HUB_URL!,
    sourceAppKey: "training",
    serviceToken: process.env.MACTECH_HUB_SERVICE_TOKEN,
  },
});
```

## Examples

Per-app consumer patterns in `examples/`:

- `training-consumer.ts`
- `qms-consumer.ts`
- `governance-consumer.ts`
- `growth-capture-consumer.ts`
- `pricing-consumer.ts`
- `proposal-consumer.ts`
- `portal-consumer.ts`

Legacy combined examples remain in `consumer-examples.ts` (live `createHubServiceClient` API).

## AGENTS block (copy into satellite repos)

```markdown
## MacTech Suite — Pre-Tenant Speed Mode

**Binding:** DR-2026-06-10-01 (Clerk/Hub boundary) + DR-2026-06-10-02 (Speed Mode)

### Identity (non-negotiable)

- **Clerk** authenticates the session only.
- **Hub** authorizes everything via `@mactech/hub-client` / `resolveAppAccess`.
- **No local identity authority** — no satellite-owned users, orgs, tenants, roles, or entitlements tables.
- Clerk Organizations are directory/sync input only.

### This repo

- **Canonical appKey:** `APP_KEY` (see `mactech-suite-workspace-control/canonical-app-keys.md`)
- **Branch convention:** `agent/<app>-v1` for Speed Mode buildout
- **Protected routes:** Clerk session → Hub authority snapshot → domain logic

### You may

- Build complete bounded-context features on an isolated branch
- Add domain models, UI, workflows, adapters, enforcement screens
- Use `createMockHubAuthority()` for local dev when live Hub is unavailable

### You may not

- Commit secrets, `.env`, tokens, or credentials
- Deploy, run production migrations, or change live infra without Brian
- Redefine identity ownership or bypass Hub `resolveAppAccess`
- Touch T3 repos (Codex/Vault, EnclaveWatch, Cyber Range, assessor packages)

### Merge gate

Open a PR. Brian reviews and approves or kills. No pre-authorization needed to **start** the branch.

### References

- Control repo: `docs/HUB_AUTH_CONTRACT_V1_SPEC.md`
- Control repo: `docs/HUB_CLERK_INTEGRATION_POSTURE.md`
- Live Hub: `mactech-suite-platform/docs/HUB_AUTHORITY_CONTRACT_V1.md`
```

## References

- Runtime contract: `mactech-suite-platform/docs/HUB_AUTHORITY_CONTRACT_V1.md`
- Serialization spec: `mactech-suite-workspace-control/docs/HUB_AUTH_CONTRACT_V1_SPEC.md`
- Clerk/Hub boundary: DR-2026-06-10-01
