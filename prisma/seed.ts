/**
 * Seed script for the Identity Command Center.
 *
 * Idempotent: every upsert is keyed by a stable identifier so repeated runs
 * never create duplicate rows. Optional env flags let you bootstrap your
 * own MacTech Super Admin profile alongside the system fixtures.
 */

import { PrismaClient, MembershipRole } from "@prisma/client";
import {
  PLATFORM_ROLE_DEFINITIONS,
  CUSTOMER_ROLE_DEFINITIONS,
} from "../lib/permissions";

const prisma = new PrismaClient();

const APP_FIXTURES = [
  {
    appKey: "cui-vault",
    name: "CUI Vault",
    description: "Encrypted vault for Controlled Unclassified Information.",
    category: "vault" as const,
    baseUrl: "https://vault.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
  },
  {
    appKey: "compliance-control-plane",
    name: "Compliance Control Plane",
    description: "Continuous compliance posture, controls catalog, and remediation workflows.",
    category: "compliance" as const,
    baseUrl: "https://compliance.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
  },
  {
    appKey: "evidence-engine",
    name: "Evidence Engine",
    description: "Evidence collection, approvals, and assessor-ready exports.",
    category: "evidence" as const,
    baseUrl: "https://evidence.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
  },
  {
    appKey: "boundary-engine",
    name: "Boundary Engine",
    description: "System boundary modeling, data flow analysis, and CUI scoping.",
    category: "compliance" as const,
    baseUrl: "https://boundary.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
  },
  {
    appKey: "sam-capture-intelligence",
    name: "SAM Capture Intelligence",
    description: "Federal opportunity intelligence sourced from SAM.gov.",
    category: "capture" as const,
    baseUrl: "https://capture.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
  },
  {
    appKey: "contract-intelligence",
    name: "Contract / Opportunity Intelligence",
    description: "Contract analysis, win/loss intelligence, and pursuit strategy.",
    category: "reporting" as const,
    baseUrl: "https://contracts.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
  },
  {
    appKey: "identity-command-center",
    name: "Identity Command Center",
    description: "Central SSO, RBAC, entitlement, and audit hub for the suite.",
    category: "admin" as const,
    baseUrl: "https://identity.mactechsolutionsllc.com",
    requiresOrgContext: false,
    isInternalOnly: true,
    status: "active" as const,
  },
];

async function seedApps() {
  for (const app of APP_FIXTURES) {
    await prisma.appRegistry.upsert({
      where: { appKey: app.appKey },
      update: {
        name: app.name,
        description: app.description,
        category: app.category,
        baseUrl: app.baseUrl,
        requiresOrgContext: app.requiresOrgContext,
        isInternalOnly: app.isInternalOnly,
        status: app.status,
      },
      create: app,
    });
  }
}

async function seedRoleTemplates() {
  for (const role of PLATFORM_ROLE_DEFINITIONS) {
    await prisma.roleTemplate.upsert({
      where: { scope_key: { scope: "platform", key: role.key } },
      update: {
        name: role.name,
        description: role.description,
        permissionsJson: role.permissions as unknown as object,
        isSystemRole: true,
      },
      create: {
        scope: "platform",
        key: role.key,
        name: role.name,
        description: role.description,
        permissionsJson: role.permissions as unknown as object,
        isSystemRole: true,
      },
    });
  }

  for (const role of CUSTOMER_ROLE_DEFINITIONS) {
    await prisma.roleTemplate.upsert({
      where: { scope_key: { scope: "customer_org", key: role.key } },
      update: {
        name: role.name,
        description: role.description,
        permissionsJson: role.permissions as unknown as object,
        isSystemRole: true,
      },
      create: {
        scope: "customer_org",
        key: role.key,
        name: role.name,
        description: role.description,
        permissionsJson: role.permissions as unknown as object,
        isSystemRole: true,
      },
    });
  }
}

async function seedSuperAdmin() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const clerkUserId = process.env.SEED_SUPER_ADMIN_CLERK_USER_ID;
  if (!email) {
    console.log(
      "⚠️  Skipping super admin seeding (set SEED_SUPER_ADMIN_EMAIL to bootstrap one).",
    );
    return;
  }
  await prisma.userProfile.upsert({
    where: { email },
    update: {
      isInternalMacTechUser: true,
      platformRole: "mactech_super_admin",
      status: "active",
      clerkUserId: clerkUserId || undefined,
    },
    create: {
      email,
      clerkUserId: clerkUserId || `pending_${Date.now()}`,
      isInternalMacTechUser: true,
      platformRole: "mactech_super_admin",
      status: "active",
    },
  });
  console.log(`✓ MacTech Super Admin seeded for ${email}`);
}

async function seedLegacyTenant() {
  // Keep the original bootstrap row alive so the existing /api/tenant route
  // and the auth adapter integration tests still resolve.
  const tenant = await prisma.tenant.upsert({
    where: { slug: "mactech-bootstrap" },
    update: {},
    create: {
      slug: "mactech-bootstrap",
      name: "MacTech Bootstrap",
      externalId: process.env.SEED_TENANT_EXTERNAL_ID || "tenant_bootstrap_001",
      isActive: true,
    },
  });

  const externalUserId = process.env.SEED_DEVELOPER_EXTERNAL_ID;
  const developerEmail = process.env.SEED_DEVELOPER_EMAIL;
  if (!externalUserId || !developerEmail) return;

  const user = await prisma.user.upsert({
    where: { externalId: externalUserId },
    update: { email: developerEmail },
    create: {
      externalId: externalUserId,
      email: developerEmail,
      name: process.env.SEED_DEVELOPER_NAME || "Developer",
      isActive: true,
    },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: MembershipRole.OWNER, isActive: true },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: MembershipRole.OWNER,
      isActive: true,
    },
  });
}

async function main() {
  console.log("🌱 Seeding Identity Command Center fixtures...");
  await seedApps();
  console.log("✓ App registry seeded");
  await seedRoleTemplates();
  console.log("✓ Role templates seeded");
  await seedLegacyTenant();
  console.log("✓ Legacy tenant scaffold seeded");
  await seedSuperAdmin();
  console.log("✅ Seed complete");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
