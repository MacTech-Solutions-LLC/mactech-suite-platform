# MacTech Identity Command Center

Central SSO, organization, RBAC, entitlement, and audit hub for the MacTech
Suite (CUI Vault, Compliance Control Plane, Evidence Engine, Boundary Engine,
SAM Capture Intelligence, Contract / Opportunity Intelligence, and future
MacTech apps).

This repository is the platform foundation. It is **not** customer-facing:
sign-in is restricted to MacTech internal admins and Clerk-provisioned
customer users. Every admin action is captured in an immutable central audit
log.

## Stack

- **Next.js 14** (App Router, Server Components, Server Actions)
- **TypeScript**, **Tailwind CSS**, shadcn-style UI primitives
- **PostgreSQL** + **Prisma 5**
- **Clerk** for identity, sessions, organizations, memberships
- **Zod** for input validation
- **svix** for Clerk webhook signature verification

## Quick start

```bash
# 1. Clone and install
gh repo clone MacTech-Solutions-LLC/mactech-suite-platform
cd mactech-suite-platform
npm install

# 2. Configure environment
cp .env.example .env
# (edit .env — see "Environment variables" below)

# 3. Bring up Postgres + run migrations
npm run docker:up
npx prisma migrate dev --name identity_command_center
npx prisma generate

# 4. Seed app registry, role templates, optional super admin
npm run db:seed

# 5. Start dev server
npm run dev
# open http://localhost:3000
```

## Clerk vs MacTech database responsibilities

**Clerk owns:**

- User identity and credentials
- Sessions, MFA, federated SSO
- Organization records
- Organization memberships
- Organization invitations
- Core auth security policy

**MacTech database owns:**

- Customer organization metadata (CAGE, UEI, CMMC posture, subscription tier, …)
- Product entitlements (which app, which plan, which seats, what configuration)
- App registry (the canonical list of MacTech apps and their launch URLs)
- Platform role assignments (`UserProfile.platformRole`, `OrgUserAccess.role`)
- Local role templates (`RoleTemplate`)
- Central audit logs (`AuditLog`)
- Security events (`SecurityEvent`)
- Compliance and tenant lifecycle context

Clerk identifiers (`clerkUserId`, `clerkOrgId`, `clerkMembershipId`) are stored
on local rows so the two systems can be joined, but business logic and
authorization decisions read from the local schema.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `NEXT_PUBLIC_APP_URL` | yes | Canonical URL of this app (used in Clerk redirects, audit logs) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | yes | Clerk secret key (server-only) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | optional | Defaults to `/sign-in` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | optional | Defaults to `/dashboard` |
| `CLERK_WEBHOOK_SECRET` | recommended | Signing secret for `/api/webhooks/clerk` |
| `AUDIT_INGEST_API_KEY` | recommended | Bearer key required by `/api/audit/ingest` |
| `SEED_SUPER_ADMIN_EMAIL` | optional | Bootstraps a `mactech_super_admin` profile on seed |
| `SEED_SUPER_ADMIN_CLERK_USER_ID` | optional | Pairs the seeded profile with a real Clerk user |

## Clerk dashboard setup

1. **Create application** in [Clerk dashboard](https://dashboard.clerk.com).
2. **Enable organizations** (Configure → Organizations) — required.
3. **Authorized parties** — add `NEXT_PUBLIC_APP_URL`.
4. **Webhooks** (Configure → Webhooks) — add an endpoint
   `${NEXT_PUBLIC_APP_URL}/api/webhooks/clerk` and subscribe to:
   - `user.created`, `user.updated`, `user.deleted`
   - `organization.created`, `organization.updated`, `organization.deleted`
   - `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`

   Copy the **Signing Secret** to `CLERK_WEBHOOK_SECRET`.

5. **Branding (optional)** — the app injects a dark-themed `appearance` to
   `<ClerkProvider>` so hosted Clerk components match the command center.

## Database

```bash
npx prisma migrate dev --name <slug>   # create + apply migration
npx prisma generate                    # regenerate types after schema edits
npm run db:seed                        # idempotent seed
npm run db:studio                      # Prisma Studio
```

## Bootstrapping the first MacTech Super Admin

Two ways:

1. **Seed-driven (recommended):** Set
   `SEED_SUPER_ADMIN_EMAIL=you@mactechsolutionsllc.com` (and optionally
   `SEED_SUPER_ADMIN_CLERK_USER_ID`) before running `npm run db:seed`. The
   seed will upsert a `UserProfile` with `isInternalMacTechUser=true` and
   `platformRole=mactech_super_admin`.

2. **Direct SQL:** After signing in once via Clerk so a profile exists,
   ```sql
   UPDATE "UserProfile"
   SET "isInternalMacTechUser" = true, "platformRole" = 'mactech_super_admin'
   WHERE email = 'you@mactechsolutionsllc.com';
   ```

Sign in at `/sign-in`. The middleware + admin layout then route you to
`/dashboard`. Everyone else is redirected to `/access-restricted`.

## Customer organizations and Clerk

Each `CustomerOrganization` may be linked to a Clerk organization via
`clerkOrgId`. When a MacTech admin creates a customer org through the
**Customer Organizations → New customer org** form, the service:

1. Creates a Clerk organization (when `CLERK_SECRET_KEY` is configured).
2. Creates the local `CustomerOrganization` row.
3. Optionally enables initial product entitlements (trial plan).
4. Writes audit log entries for the create + each entitlement enabled.

If Clerk is not configured the local row is still created, and an admin can
attach a `clerkOrgId` later. Webhooks (`organization.created/updated`) keep
them in sync.

## Product entitlements

Entitlements are stored in `ProductEntitlement` (one row per
`CustomerOrganization × AppRegistry`). The matrix at `/admin/product-access`
shows the full grid. The detail page at
`/admin/customer-orgs/[orgId]/entitlements` lets admins toggle, set plan,
seats, expiration, and arbitrary configuration JSON. Every change writes an
audit log.

A safe redirect helper at `/app-launch/[appKey]?orgId=...` verifies entitlement
state, writes a `app_launch.redirect` audit event, then sends the user to
`AppRegistry.baseUrl` with the customer's `clerkOrgId` as opaque context.

## Audit logging

All admin mutations call `lib/audit.ts > writeAuditLog` (or `writeSecurityEvent`).
Audit entries are immutable from the UI — there is no delete control.

### Filterable surfaces

- `/admin/audit-logs` — central, filterable, CSV export
- `/admin/customer-orgs/[orgId]/audit` — scoped to a customer
- Dashboard recent activity card

### Cross-app audit ingestion

Sibling MacTech apps submit audit logs via:

```
POST /api/audit/ingest
Headers: X-MacTech-Audit-Key: <AUDIT_INGEST_API_KEY>
Body:    JSON matching lib/validations/audit.ts > auditIngestSchema
```

`lib/audit-client-example.ts` ships a dependency-free helper sibling apps
can drop in. The endpoint:

- Verifies the static API key.
- Validates the payload with Zod.
- Looks up the `AppRegistry` row by `appKey`.
- Optionally resolves a Clerk org id → `CustomerOrganization`.
- Optionally resolves an actor's `clerkUserId` → `UserProfile`.
- Captures IP and user-agent.
- Writes an `AuditLog` row and returns its id.

Rotate `AUDIT_INGEST_API_KEY` on personnel changes. Each app should keep its
own copy; the IP and `appKey` make audit-trail attribution unambiguous.

## Authorization model

Two authority planes:

1. **Platform (MacTech internal admin)** — `UserProfile.platformRole` ∈
   `mactech_super_admin | mactech_admin | mactech_support | mactech_auditor | mactech_read_only`.
2. **Customer organization** — `OrgUserAccess.role` ∈
   `customer_owner | customer_admin | compliance_manager | security_manager | evidence_contributor | auditor | read_only_user`.

Permission strings are defined in `lib/permissions.ts`. Every server action
calls one of:

- `requirePlatformPermission(perm)` for admin operations.
- `requireCustomerOrgAccess(orgId)` to ensure the caller is in the org or a MacTech admin.
- `requireOrgPermission(orgId, perm)` for org-scoped actions.

## Project layout

```
app/
├── (admin)/                      # Route group; gates with platform role
│   ├── layout.tsx                # AdminShell + auth gate
│   ├── dashboard/
│   └── admin/
│       ├── mactech-users/
│       ├── customer-orgs/
│       │   └── [orgId]/{users,entitlements,audit}/
│       ├── users/
│       ├── product-access/
│       ├── roles/
│       ├── audit-logs/
│       ├── app-registry/
│       ├── security-events/
│       └── settings/
├── access-restricted/
├── sign-in/[[...sign-in]]/
├── sign-up/[[...sign-up]]/
├── api/
│   ├── webhooks/clerk/
│   ├── audit/{ingest,export}/
│   └── tenant/                   # legacy proof-of-scoping route
├── app-launch/[appKey]/          # safe entitlement-aware redirect

components/
├── ui/                           # shadcn-style primitives
├── layout/                       # admin shell + sidebar + topbar
├── tables/                       # audit, customer-org, user
├── forms/                        # create org, invite user, entitlement, app
├── drawers/                      # detail sheets (audit, security)
└── cards/

lib/
├── env.ts                        # zod-validated env
├── authz.ts                      # auth context + permission guards
├── audit.ts                      # writeAuditLog, getAuditLogs, redaction
├── permissions.ts                # permission constants + role templates
├── audit-client-example.ts       # helper for sibling apps
├── services/                     # server actions ('use server')
├── validations/                  # zod schemas per domain
└── db/                           # prisma client + tenant guard (legacy)
```

## Security assumptions

- All `/admin/*` and `/dashboard` routes pass through Clerk middleware **and**
  a server-side platform-role check in `app/(admin)/layout.tsx`.
- Server actions all call `requirePlatformPermission(...)` before mutating.
- Webhooks verify svix signatures. Audit ingestion verifies a static key.
- `lib/audit.ts > redactMetadata` strips obvious secrets (`password`, `token`,
  `secret`, `api_key`, `authorization`, `cookie`, `ssn`, `dob`) before
  persisting metadata.
- The audit log table is treated as append-only — there is no delete UI.
- The `MacTechAuthContext` flow (legacy `lib/auth/adapter.ts`) is retained for
  the original `/api/tenant` route.

## Future enhancements

- Promote/demote MacTech admins from the UI (currently DB-driven by design).
- Customer-facing launch portal (currently MacTech admin only).
- Org user role-change UI (server action exists; modal pending).
- Time-series charts on the dashboard via Postgres timeseries views.
- SCIM provisioning for federated customer SSO.
- CMMC-aware policy assertions on entitlements (pre-flight checks).
