# MacTech Suite - Local Development Guide

> MT-019: Docker Local Sandbox Setup
> Traceability: NIST 800-171 SC.L2-3.13.1 (Boundary Protection)

This guide helps you set up a disposable local development environment using Docker. This keeps your development telemetry entirely local until you're ready for intentional cloud testing.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
- Node.js 18+ and npm
- Git

## Quick Start (5 minutes)

### 1. Start the Docker Database

```bash
# Start PostgreSQL and Adminer (database UI)
npm run docker:up

# Or manually:
docker-compose up -d
```

Services available:
- **PostgreSQL**: `localhost:5432`
- **Adminer (DB UI)**: http://localhost:8080
  - Server: `postgres`
  - Username: `mactech_dev`
  - Password: `mactech_dev_pass`
  - Database: `mactech_local`

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env
```

The `.env` is pre-configured with Docker credentials. Update Clerk variables:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_YOUR_KEY_HERE"
CLERK_SECRET_KEY="sk_test_YOUR_KEY_HERE"
```

Get these from: https://dashboard.clerk.com

### 3. Initialize Database

```bash
# Run migrations (creates tables from schema)
npx prisma migrate dev

# Apply initial migration name when prompted
# Suggested: "initial_schema_mt018"
```

### 4. Seed Your Developer Identity

**CRITICAL**: Update the seed script with YOUR identity before running:

Edit `prisma/seed.ts` and replace:
- `EXTERNAL_ID_PLACEHOLDER` → Your Clerk User ID (from Clerk Dashboard)
- `brian@example.com` → Your actual email
- `Brian Developer` → Your name

```bash
# Run the seed script
npx prisma db seed

# Or via npm script:
npm run db:seed
```

**What the seed creates:**
- Bootstrap Tenant: "MacTech Bootstrap"
- Your User account (linked to Clerk identity)
- ACTIVE OWNER membership
- First audit event logged

### 5. Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000

### 6. Test the API

```bash
# This should now return 200 with your tenant data
# (Previously returned 401 before seeding)
curl http://localhost:3000/api/tenant
```

Expected response:
```json
{
  "tenant": {
    "id": "cuid...",
    "name": "MacTech Bootstrap",
    "slug": "mactech-bootstrap",
    "isActive": true
  },
  "user": {
    "id": "cuid...",
    "role": "OWNER"
  }
}
```

## The "Reset Button"

If you mess up the tenant mapping or want a clean slate:

```bash
# Destroy all data and containers
npm run docker:reset

# Or manually:
docker-compose down -v

# Then restart from Step 1
```

## Useful Commands

| Command | Purpose |
|---------|---------|
| `npm run docker:up` | Start PostgreSQL + Adminer |
| `npm run docker:down` | Stop containers (keep data) |
| `npm run docker:reset` | **Destroy everything** (reset button) |
| `npx prisma migrate dev` | Run database migrations |
| `npx prisma db seed` | Seed developer data |
| `npx prisma studio` | Open database UI |
| `npm run db:seed` | Alternative seed command |

## External Identity Mapping

The critical bridge between Clerk and MacTech happens via `externalId`:

```
Clerk User ID ──┐
                ├──►  prisma.user.externalId  ──►  internalUserId
Google Sub ─────┘

Clerk Org ID ───┐
                ├──►  prisma.tenant.externalId ──►  tenantId
Placeholder ────┘
```

**Never use external IDs in business logic.** Always resolve to internal MacTech IDs via the Auth Adapter.

## Troubleshooting

### "Database connection failed"

Check if Docker is running:
```bash
docker ps
```

Start the database:
```bash
npm run docker:up
```

### "User not found" errors

Your `externalId` in the seed doesn't match your Clerk login. Update `prisma/seed.ts` with your actual Clerk User ID, then:

```bash
npm run docker:reset
npm run docker:up
npx prisma migrate dev
npx prisma db seed
```

### "401 Unauthorized" from API

1. Check you're logged in via Clerk (http://localhost:3000 with Clerk components)
2. Verify your membership is ACTIVE in Adminer
3. Check that your Clerk User ID matches the seed's `externalId`

### Find your Clerk User ID

1. Log in to https://dashboard.clerk.com
2. Go to **Users**
3. Find your email, click it
4. Copy the **User ID** (starts with `user_`)

## Compliance Notes

- ✅ Development stays local (no cloud DB credentials in dev)
- ✅ Disposable environment (full reset in seconds)
- ✅ No production data in local environment
- ✅ Audit trail starts at first seed

## Next Steps

Once local validation passes:
1. Continue with MT-020: UI Components
2. MT-021: Cloud deployment planning
3. Production Clerk organization setup

---

**Need help?** Check the audit trail in Adminer at http://localhost:8080
