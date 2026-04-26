/**
 * MT-019: The "Ghost" Seed Script
 * 
 * This script initializes the local development environment with:
 * 1. The Bootstrap Tenant (first organization)
 * 2. The Developer User (your identity mapped to Clerk/Google)
 * 3. An ACTIVE OWNER membership linking them
 * 4. Audit trail of the creation
 * 
 * CRITICAL: Update EXTERNAL_ID_PLACEHOLDER with your actual Clerk user_id
 * before running this script. Get it from:
 * - Clerk Dashboard -> Users -> your email -> User ID
 * - Or after first login attempt, check logs for "User not found" errors
 * 
 * Usage:
 *   npx prisma db seed
 * 
 * Or manually:
 *   npx ts-node prisma/seed.ts
 */

import { PrismaClient, MembershipRole } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// CONFIGURATION: Update these values with YOUR identity
// ============================================================================

/**
 * Your external identity provider ID (from Clerk or Google)
 * This maps the external login to your internal MacTech user
 * 
 * Clerk format: "user_xxxxxxxxxxxxxxxxxxxxxxxx"
 * Google format: "xxxxxxxxxxxxxxxxxxxxxxxxx" (numeric sub as string)
 * 
 * SECURITY: Never hardcode real IDs. Set via environment variables only.
 */
const DEVELOPER_EXTERNAL_ID = process.env.SEED_DEVELOPER_EXTERNAL_ID;

/**
 * Your email address
 */
const DEVELOPER_EMAIL = process.env.SEED_DEVELOPER_EMAIL || 
  'brian@example.com'; // <-- REPLACE THIS

/**
 * Your name
 */
const DEVELOPER_NAME = process.env.SEED_DEVELOPER_NAME || 
  'Brian Developer'; // <-- REPLACE THIS

/**
 * The bootstrap tenant's external ID (from Clerk Organizations)
 * 
 * Clerk Org format: "org_xxxxxxxxxxxxxxxxxxxxxxxx"
 * 
 * SECURITY: Never hardcode real IDs. Set via environment variables only.
 */
const TENANT_EXTERNAL_ID = process.env.SEED_TENANT_EXTERNAL_ID;

// ============================================================================
// SEED LOGIC
// ============================================================================

async function main() {
  console.log('🌱 Starting MT-019 seed script...');
  console.log('');

  // Validate configuration - SECURITY: Require environment variables
  if (!DEVELOPER_EXTERNAL_ID || !TENANT_EXTERNAL_ID) {
    throw new Error(
      'Missing SEED_DEVELOPER_EXTERNAL_ID or SEED_TENANT_EXTERNAL_ID.\n' +
      'Set them in .env.local for local seeding.\n' +
      'Example:\n' +
      '  SEED_DEVELOPER_EXTERNAL_ID=user_xxxxx\n' +
      '  SEED_TENANT_EXTERNAL_ID=org_xxxxx'
    );
  }

  // Step 1: Create the Bootstrap Tenant
  console.log('🏢 Creating bootstrap tenant...');
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'mactech-bootstrap' },
    update: {}, // Don't update if exists
    create: {
      externalId: TENANT_EXTERNAL_ID,
      name: 'MacTech Bootstrap',
      slug: 'mactech-bootstrap',
      isActive: true,
    },
  });
  console.log(`   ✓ Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`   External ID: ${tenant.externalId}`);
  console.log('');

  // Step 2: Create the Developer User
  console.log('👤 Creating developer user...');
  const user = await prisma.user.upsert({
    where: { externalId: DEVELOPER_EXTERNAL_ID },
    update: {}, // Don't update if exists
    create: {
      externalId: DEVELOPER_EXTERNAL_ID,
      email: DEVELOPER_EMAIL,
      name: DEVELOPER_NAME,
      isActive: true,
    },
  });
  console.log(`   ✓ User: ${user.name} (${user.id})`);
  console.log(`   External ID: ${user.externalId}`);
  console.log(`   Email: ${user.email}`);
  console.log('');

  // Step 3: Create ACTIVE OWNER Membership
  console.log('🔗 Creating OWNER membership...');
  const membership = await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: user.id,
      },
    },
    update: {
      // Ensure membership is active if re-seeding
      isActive: true,
      role: MembershipRole.OWNER,
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: MembershipRole.OWNER,
      isActive: true,
    },
  });
  console.log(`   ✓ Membership: ${membership.id}`);
  console.log(`   Role: ${membership.role}`);
  console.log(`   Status: ${membership.isActive ? 'ACTIVE' : 'INACTIVE'}`);
  console.log('');

  // Step 4: Create Audit Trail Entry
  console.log('📝 Creating audit event...');
  const auditEvent = await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      action: 'TENANT_BOOTSTRAP',
      entity: 'Tenant',
      entityId: tenant.id,
      metadata: {
        source: 'prisma/seed.ts',
        reason: 'MT-019 Local Development Bootstrap',
        userExternalId: DEVELOPER_EXTERNAL_ID,
      },
    },
  });
  console.log(`   ✓ Audit Event: ${auditEvent.id}`);
  console.log(`   Action: ${auditEvent.action}`);
  console.log(`   Timestamp: ${auditEvent.timestamp}`);
  console.log('');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('✅ Seed complete! Summary:');
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│  MACTECH LOCAL SANDBOX                                  │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│  Tenant:  ${tenant.name.padEnd(42)}│`);
  console.log(`│  User:     ${user.name?.padEnd(42) || 'N/A'.padEnd(42)}│`);
  console.log(`│  Email:    ${user.email.padEnd(42)}│`);
  console.log(`│  Role:     ${membership.role.padEnd(42)}│`);
  console.log(`│  Status:   ${(membership.isActive ? 'ACTIVE ✓' : 'INACTIVE ✗').padEnd(42)}│`);
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log('│  NEXT STEPS:                                            │');
  console.log('│  1. Copy .env.example to .env                           │');
  console.log('│  2. Set DATABASE_URL to point to Docker Postgres          │');
  console.log('│  3. Run: npx prisma migrate dev                         │');
  console.log('│  4. Start dev server: npm run dev                       │');
  console.log('│  5. Visit: http://localhost:3000/api/tenant             │');
  console.log('│     (Should now return 200 with your tenant data)       │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
