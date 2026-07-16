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
import { LEGACY_ENV_KEY_NAME } from "../lib/env";

const prisma = new PrismaClient();

// Live apps in the MacTech Suite ecosystem. Keys are stable identifiers
// used by the audit ingestion API and product entitlement matrix — do
// not rename them without coordinating with the corresponding sibling
// app's audit client.
//
// growth-capture is canonical for Opportunity & Capture (legacy alias:
// capture). Existing live DB rows keyed `capture` require a manual
// registry retirement/migration before production seed re-run — no live
// DB migration in Phase R-2b.
//
// Operational fields drive the Command Center: publicUrl + healthUrl
// for the probe loop, repoFullName for repo intelligence (slice 2),
// railwayServiceId for deployment intelligence (slice 3). Health URLs
// follow the convention documented in docs/COMMAND_CENTER.md
// (`/api/health` returning JSON with `status: "ok"`). Apps that
// don't have one yet leave healthUrl null and the Command Center
// flags them as `missing_health_endpoint`.
const APP_FIXTURES = [
  {
    appKey: "growth-capture",
    name: "Opportunity & Capture",
    description:
      "Opportunity discovery, qualification, pursuit execution, and capture package preparation. Legacy alias: capture.",
    category: "capture" as const,
    baseUrl: "https://opportunities.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "development" as const,
    publicUrl: "https://opportunities.mactechsolutionsllc.com",
    subdomain: "opportunities",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "development" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/Opportunities",
    repoDefaultBranch: "main",
  },
  {
    appKey: "codex",
    name: "MacTech Codex",
    description: "CMMC compliance plane (controls, evidence, posture).",
    category: "compliance" as const,
    baseUrl: "https://codex.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://codex.mactechsolutionsllc.com",
    healthUrl: "https://codex.mactechsolutionsllc.com/api/health",
    buildInfoUrl: "https://codex.mactechsolutionsllc.com/api/build-info",
    subdomain: "codex",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "mission_critical" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "WELCOMETOTHETRIBE/CMMC",
    repoDefaultBranch: "main",
  },
  {
    appKey: "training",
    name: "MacTech Training",
    description: "Training courses, certifications, and audit-ready evidence-of-training.",
    category: "training" as const,
    baseUrl: "https://training.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://training.mactechsolutionsllc.com",
    healthUrl: "https://training.mactechsolutionsllc.com/api/health",
    buildInfoUrl: "https://training.mactechsolutionsllc.com/api/build-info",
    subdomain: "training",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "WELCOMETOTHETRIBE/cmmc-training-hub",
    repoDefaultBranch: "main",
  },
  {
    appKey: "quality",
    name: "MacTech Quality (QMS)",
    description: "Document control, change management, and audit trail for the QMS.",
    category: "compliance" as const,
    baseUrl: "https://quality.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://quality.mactechsolutionsllc.com",
    healthUrl: "https://quality.mactechsolutionsllc.com/api/health",
    buildInfoUrl: "https://quality.mactechsolutionsllc.com/api/build-info",
    subdomain: "quality",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/QMS",
    repoDefaultBranch: "main",
  },
  {
    appKey: "cleard",
    name: "clearD by MacTech",
    description: "Cleared talent network and sourcing platform for mission-ready defense work.",
    category: "other" as const,
    baseUrl: "https://cleard.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://cleard.mactechsolutionsllc.com",
    subdomain: "cleard",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "medium" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
  },
  {
    appKey: "identity-command-center",
    name: "MacTech Suite (Command Center)",
    description:
      "Suite IS the product; Command Center IS the flagship capability. Identity, AppRegistry, " +
      "entitlements, ecosystem health, deployment drift, repository intelligence, audit trail.",
    category: "admin" as const,
    baseUrl: "https://www.suite.mactechsolutionsllc.com",
    requiresOrgContext: false,
    isInternalOnly: true,
    status: "active" as const,
    publicUrl: "https://www.suite.mactechsolutionsllc.com",
    adminUrl: "https://www.suite.mactechsolutionsllc.com/command-center",
    healthUrl: "https://www.suite.mactechsolutionsllc.com/api/health",
    buildInfoUrl: "https://www.suite.mactechsolutionsllc.com/api/build-info",
    subdomain: "www.suite",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "mission_critical" as const,
    lifecycle: "production" as const,
    visibility: "internal" as const,
    repoFullName: "MacTech-Solutions-LLC/mactech-suite-platform",
    repoDefaultBranch: "main",
  },
  {
    appKey: "hub",
    name: "MacTech Suite Hub",
    description: "Suite control plane for identity, tenants, access, navigation, and audit.",
    category: "admin" as const,
    baseUrl: "https://www.suite.mactechsolutionsllc.com",
    requiresOrgContext: false,
    isInternalOnly: true,
    status: "active" as const,
    publicUrl: "https://www.suite.mactechsolutionsllc.com",
    adminUrl: "https://www.suite.mactechsolutionsllc.com/command-center",
    subdomain: "www.suite",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "mission_critical" as const,
    lifecycle: "production" as const,
    visibility: "internal" as const,
    repoFullName: "MacTech-Solutions-LLC/mactech-suite-platform",
    repoDefaultBranch: "main",
  },
  {
    appKey: "qms",
    name: "QMS",
    description: "Controlled documents, records, evidence, and approvals.",
    category: "evidence" as const,
    baseUrl: "https://qms.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://qms.mactechsolutionsllc.com",
    subdomain: "qms",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/QMS",
    repoDefaultBranch: "main",
  },
  {
    appKey: "governance",
    name: "MacTech Governance",
    description:
      "GovCon governance workspace: clauses, reps & certs, delegation, flowdowns, FRCS cyber scope, evidence, post-award.",
    category: "compliance" as const,
    baseUrl: "https://governance.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://governance.mactechsolutionsllc.com",
    healthUrl: "https://governance.mactechsolutionsllc.com/api/health",
    buildInfoUrl: "https://governance.mactechsolutionsllc.com/api/build-info",
    subdomain: "governance",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/Governance",
    repoDefaultBranch: "main",
  },
  {
    appKey: "enclavewatch",
    name: "MacTech EnclaveWatch",
    description:
      "Vault-resident audit, drift validation, ISSO weekly review, and signed evidence export.",
    category: "evidence" as const,
    baseUrl: "https://vault-001.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://vault-001.mactechsolutionsllc.com",
    // EnclaveWatch's /api/health is anonymous per the existing route in
    // src/EnclaveWatch.Service/Program.cs.
    healthUrl: "https://vault-001.mactechsolutionsllc.com/api/health",
    subdomain: "vault-001",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "mission_critical" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/enclavewatch",
    repoDefaultBranch: "main",
  },
  {
    appKey: "opportunities",
    name: "MacTech Opportunities (deprecated)",
    description:
      "Superseded by growth-capture (Opportunity & Capture). Retained as a hidden legacy registry row only.",
    category: "capture" as const,
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "hidden" as const,
    publicUrl: "https://opportunities.mactechsolutionsllc.com",
    subdomain: "opportunities",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "low" as const,
    lifecycle: "deprecated" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/Opportunities",
    repoDefaultBranch: "main",
  },
  {
    appKey: "proposal",
    name: "MacTech Proposal (ProposalOS)",
    description: "Proposal workspace covering Section K reps & certs, FRCS cyber execution, and cost-volume submission.",
    category: "reporting" as const,
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "development" as const,
    publicUrl: "https://proposal.mactechsolutionsllc.com",
    subdomain: "proposal",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "development" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/Proposal",
    repoDefaultBranch: "main",
  },
  {
    appKey: "pricing",
    name: "MacTech Pricing (PricingOS)",
    description: "Proposed pricing authority for rate snapshots, BOE, scenarios, cost realism, Green Team approval, and immutable price-volume exports.",
    category: "reporting" as const,
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://pricing.mactechsolutionsllc.com",
    healthUrl: "https://pricing.mactechsolutionsllc.com/api/health",
    buildInfoUrl: "https://pricing.mactechsolutionsllc.com/api/build-info",
    subdomain: "pricing",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/Pricing",
    repoDefaultBranch: "main",
  },
  {
    appKey: "finance",
    name: "Finance",
    description: "Actual accounting authority for DCAA-ready timekeeping, charge codes, labor distribution, payroll reconciliation, invoicing, payments, financial actuals, and QuickBooks handoff via Hub OAuth proxy.",
    category: "reporting" as const,
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://finance.mactechsolutionsllc.com",
    healthUrl: "https://finance.mactechsolutionsllc.com/api/health",
    buildInfoUrl: "https://finance.mactechsolutionsllc.com/api/build-info",
    subdomain: "finance",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/Finance",
    repoDefaultBranch: "main",
  },
  {
    appKey: "bizops",
    name: "MacTech GovCon Ops",
    description:
      "GovCon capture, bids, SBIRs, teaming, proposal execution, and readiness in one secure workspace.",
    category: "other" as const,
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://bizops.mactechsolutionsllc.com",
    healthUrl: "https://bizops.mactechsolutionsllc.com/api/health",
    buildInfoUrl: "https://bizops.mactechsolutionsllc.com/api/build-info",
    subdomain: "bizops",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/bizops",
    repoDefaultBranch: "main",
  },
  {
    appKey: "contracts-delivery",
    name: "Contracts & Delivery",
    description: "Contract domain model, CLINs, and period-of-performance lifecycle (greenfield scaffold).",
    category: "reporting" as const,
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    subdomain: "contracts",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/contracts-delivery",
    repoDefaultBranch: "main",
  },
  {
    appKey: "client-portal",
    name: "Client Portal",
    description: "Hub-entitled customer display surface — dashboard, onboarding, and connection settings.",
    category: "other" as const,
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    subdomain: "portal",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "medium" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
    repoFullName: "MacTech-Solutions-LLC/client-portal",
    repoDefaultBranch: "main",
  },
  {
    appKey: "workspace-gateway",
    name: "Workspace Gateway",
    description: "Google Workspace intake gateway and draft/pending routing layer.",
    category: "other" as const,
    baseUrl: "https://workspace.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://workspace.mactechsolutionsllc.com",
    subdomain: "workspace",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "medium" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
  },
  {
    appKey: "codex-cui-vault",
    name: "Codex / CUI Vault",
    description: "CUI, CMMC, cyber evidence, and secure client deliverable enclave.",
    category: "vault" as const,
    baseUrl: "https://vault.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "active" as const,
    publicUrl: "https://vault.mactechsolutionsllc.com",
    subdomain: "vault",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "mission_critical" as const,
    lifecycle: "production" as const,
    visibility: "customer" as const,
  },
  {
    appKey: "mackali",
    name: "MacKali",
    description: "Internal MacTech offensive security and validation environment.",
    category: "other" as const,
    baseUrl: "https://mackali.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: true,
    status: "active" as const,
    publicUrl: "https://mackali.mactechsolutionsllc.com",
    subdomain: "mackali",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "internal" as const,
  },
  {
    appKey: "cyber-range",
    name: "Cyber Range",
    description: "Internal cyber range, exercise, and export environment.",
    category: "other" as const,
    baseUrl: "https://cyber-range.mactechsolutionsllc.com",
    requiresOrgContext: true,
    isInternalOnly: true,
    status: "active" as const,
    publicUrl: "https://cyber-range.mactechsolutionsllc.com",
    subdomain: "cyber-range",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "high" as const,
    lifecycle: "production" as const,
    visibility: "internal" as const,
  },
  {
    appKey: "vetted",
    name: "Vetted",
    description: "Partner vetting and supply-chain risk surfacing.",
    category: "other" as const,
    requiresOrgContext: true,
    isInternalOnly: false,
    status: "development" as const,
    subdomain: "vetted",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "low" as const,
    lifecycle: "development" as const,
    visibility: "customer" as const,
    repoFullName: "WELCOMETOTHETRIBE/vetted",
    repoDefaultBranch: "main",
  },
  {
    appKey: "mactech-core",
    name: "MacTech (legacy core)",
    description: "Legacy MacTech site / origin codebase. Tracked for audit + retirement planning.",
    category: "other" as const,
    requiresOrgContext: false,
    isInternalOnly: true,
    status: "development" as const,
    publicUrl: "https://www.mactechsolutionsllc.com",
    apexDomain: "mactechsolutionsllc.com",
    criticality: "low" as const,
    lifecycle: "deprecated" as const,
    visibility: "internal" as const,
    repoFullName: "MacTechSolutionsLLC/mactech",
    repoDefaultBranch: "main",
    // Slice 8.1: Railway IDs for the standalone "MacTech Solutions"
    // project. Project token in lib/integrations/railway/token-routing.ts
    // (RAILWAY_API_TOKEN_MACTECH) authenticates to this project.
    railwayProjectId: "72740679-75b1-4b1d-b0ec-0fbee4b7a710",
    railwayServiceId: "e9be0da9-41c9-4052-a36d-c58b5f5a579f",
    railwayEnvironmentId: "2e5bc7ae-ebfb-4423-8102-7bf1bfa1c588",
    railwayEnvironmentName: "production",
  },
];

const SERVICE_IDENTITY_FIXTURES = APP_FIXTURES.map((app) => ({
  appKey: app.appKey,
  name: `${app.name} service identity`,
  status: "active" as const,
}));

async function seedApps() {
  for (const app of APP_FIXTURES) {
    // Build a partial that only sets the operational fields the fixture
    // actually has — leaves other AppRegistry rows alone if a future seed
    // pass adds new fields without rebackfilling every row.
    const opsFields = {
      publicUrl: app.publicUrl ?? null,
      adminUrl: ("adminUrl" in app ? app.adminUrl : null) ?? null,
      healthUrl: ("healthUrl" in app ? app.healthUrl : null) ?? null,
      buildInfoUrl: ("buildInfoUrl" in app ? app.buildInfoUrl : null) ?? null,
      subdomain: app.subdomain ?? null,
      apexDomain: app.apexDomain ?? null,
      criticality: ("criticality" in app ? app.criticality : "medium") as
        | "low"
        | "medium"
        | "high"
        | "mission_critical",
      lifecycle: ("lifecycle" in app ? app.lifecycle : "production") as
        | "planned"
        | "development"
        | "staging"
        | "production"
        | "deprecated"
        | "retired",
      visibility: ("visibility" in app ? app.visibility : "customer") as
        | "internal"
        | "customer"
        | "hybrid",
      repoFullName: ("repoFullName" in app ? app.repoFullName : null) ?? null,
      repoDefaultBranch:
        ("repoDefaultBranch" in app ? app.repoDefaultBranch : null) ?? "main",
      // Slice 8.1: Railway IDs only flow through when the fixture
      // explicitly sets them — guards against the seed nulling out
      // values that runtime sync / admin edits populated for apps
      // whose fixture doesn't carry them.
      ...("railwayProjectId" in app
        ? { railwayProjectId: app.railwayProjectId }
        : {}),
      ...("railwayServiceId" in app
        ? { railwayServiceId: app.railwayServiceId }
        : {}),
      ...("railwayEnvironmentId" in app
        ? { railwayEnvironmentId: app.railwayEnvironmentId }
        : {}),
      ...("railwayEnvironmentName" in app
        ? { railwayEnvironmentName: app.railwayEnvironmentName }
        : {}),
    };
    await prisma.appRegistry.upsert({
      where: { appKey: app.appKey },
      update: {
        name: app.name,
        description: app.description,
        category: app.category,
        baseUrl: ("baseUrl" in app ? app.baseUrl : null) ?? null,
        requiresOrgContext: app.requiresOrgContext,
        isInternalOnly: app.isInternalOnly,
        status: app.status,
        ...opsFields,
      },
      create: {
        appKey: app.appKey,
        name: app.name,
        description: app.description,
        category: app.category,
        baseUrl: ("baseUrl" in app ? app.baseUrl : null) ?? null,
        requiresOrgContext: app.requiresOrgContext,
        isInternalOnly: app.isInternalOnly,
        status: app.status,
        ...opsFields,
      },
    });
  }
}

async function seedServiceIdentities() {
  for (const service of SERVICE_IDENTITY_FIXTURES) {
    await prisma.serviceIdentity.upsert({
      where: { appKey: service.appKey },
      update: {
        name: service.name,
        status: service.status,
      },
      create: service,
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

async function seedLegacyApiKey() {
  // If AUDIT_INGEST_API_KEY is set in the environment but isn't yet present
  // in the ApiKey table, register it as a fully-scoped legacy key. Lets the
  // /admin/api-keys UI show it alongside DB-issued keys + lets us revoke it
  // with one click once every consumer has rotated.
  const legacy = process.env.AUDIT_INGEST_API_KEY;
  if (!legacy) return;
  const { createHash } = await import("crypto");
  const hash = createHash("sha256").update(legacy).digest("hex");
  const existing = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (existing) return;
  await prisma.apiKey.create({
    data: {
      name: LEGACY_ENV_KEY_NAME,
      description:
        "Pre-migration env-var key. Rotate every consumer onto a DB-issued key, then revoke this row.",
      keyHash: hash,
      keyPrefix: legacy.slice(0, 12),
      scopes: ["audit_ingest", "org_read", "user_access_read", "app_authority_resolve", "object_reference_write"],
      appKey: null,
      status: "active",
    },
  });
  console.log("✓ Legacy AUDIT_INGEST_API_KEY registered as ApiKey row");
}

// MacTech ecosystem dependency edges. Seeded last (after AppRegistry)
// so all sourceAppKey / targetAppKey lookups resolve. Idempotent on
// the (source, target, type) tuple — re-running is a no-op for
// unchanged rows.
//
// Sources for the relationship inventory: per the Slice 4 brief, plus
// what's actually visible in the codebase (capture/codex/governance/
// quality/training/enclavewatch all forward audit events into the
// Suite via the audit-ingest API; suite owns identity for all apps).
const APP_DEPENDENCIES: Array<{
  sourceAppKey: string;
  targetAppKey: string;
  dependencyType:
    | "api_calls"
    | "auth_provider"
    | "shared_database"
    | "shared_domain"
    | "shared_component"
    | "content_source"
    | "evidence_source"
    | "training_source"
    | "capture_source"
    | "governance_source"
    | "qms_source"
    | "vault_source"
    | "webhook_source"
    | "other";
  description: string;
  criticality: "low" | "medium" | "high" | "mission_critical";
}> = [
  // Suite is the auth provider for every customer-facing app.
  { sourceAppKey: "growth-capture", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "mission_critical" },
  { sourceAppKey: "codex", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "mission_critical" },
  { sourceAppKey: "training", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "mission_critical" },
  { sourceAppKey: "quality", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "mission_critical" },
  { sourceAppKey: "governance", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "mission_critical" },
  { sourceAppKey: "enclavewatch", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Auditor allowlist gated through Suite", criticality: "mission_critical" },
  { sourceAppKey: "cleard", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "high" },
  { sourceAppKey: "proposal", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "medium" },
  { sourceAppKey: "finance", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "high" },
  { sourceAppKey: "bizops", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "medium" },
  { sourceAppKey: "contracts-delivery", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "high" },
  { sourceAppKey: "client-portal", targetAppKey: "identity-command-center", dependencyType: "auth_provider", description: "Clerk SSO routed through Suite", criticality: "medium" },

  // Suite ingests audit events from every sibling app.
  { sourceAppKey: "growth-capture", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "high" },
  { sourceAppKey: "codex", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "high" },
  { sourceAppKey: "training", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "high" },
  { sourceAppKey: "quality", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "high" },
  { sourceAppKey: "governance", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "high" },
  { sourceAppKey: "enclavewatch", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest + /api/v1/users/{id}/access", criticality: "high" },

  // Cross-app evidence + content flows.
  { sourceAppKey: "training", targetAppKey: "governance", dependencyType: "evidence_source", description: "Course completions feed audit posture", criticality: "high" },
  { sourceAppKey: "training", targetAppKey: "codex", dependencyType: "training_source", description: "Evidence-of-training for control 3.2.x", criticality: "high" },
  { sourceAppKey: "enclavewatch", targetAppKey: "governance", dependencyType: "evidence_source", description: "Vault audit + drift evidence for governance posture", criticality: "mission_critical" },
  { sourceAppKey: "enclavewatch", targetAppKey: "codex", dependencyType: "vault_source", description: "Signed weekly review acknowledgements + control evidence", criticality: "mission_critical" },
  { sourceAppKey: "growth-capture", targetAppKey: "proposal", dependencyType: "capture_source", description: "Pursuit + capture data feeds proposal authoring", criticality: "high" },
  { sourceAppKey: "quality", targetAppKey: "governance", dependencyType: "qms_source", description: "Document control / change records inform governance", criticality: "high" },
  { sourceAppKey: "codex", targetAppKey: "governance", dependencyType: "governance_source", description: "Control + clause knowledge powers governance workflows", criticality: "high" },
  { sourceAppKey: "governance", targetAppKey: "pricing", dependencyType: "governance_source", description: "Rate cards, clause risk, FRCS scope boundaries, and approval metadata feed PricingOS", criticality: "high" },
  { sourceAppKey: "pricing", targetAppKey: "proposal", dependencyType: "api_calls", description: "Approved price volume, BOE summary, Green Team metadata, and FRCS scope export feed ProposalOS", criticality: "high" },
  { sourceAppKey: "pricing", targetAppKey: "finance", dependencyType: "api_calls", description: "Award assumptions and approved pricing references feed Finance without transferring pricing-math authority", criticality: "high" },
  { sourceAppKey: "growth-capture", targetAppKey: "governance", dependencyType: "capture_source", description: "Opportunity FRCS and bid/no-bid signals feed GovernanceOS readiness review", criticality: "high" },

  // Suite is the registry/control shell for all apps.
  { sourceAppKey: "identity-command-center", targetAppKey: "growth-capture", dependencyType: "shared_component", description: "Suite tracks growth-capture in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "codex", dependencyType: "shared_component", description: "Suite tracks codex in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "training", dependencyType: "shared_component", description: "Suite tracks training in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "quality", dependencyType: "shared_component", description: "Suite tracks quality in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "governance", dependencyType: "shared_component", description: "Suite tracks governance in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "enclavewatch", dependencyType: "shared_component", description: "Suite tracks enclavewatch in AppRegistry + entitlements", criticality: "medium" },

  // ── Slice 5.9 connector audit additions ─────────────────────────────
  // Audit-ingest fanout for the apps the original seed missed. Every
  // sibling app POSTs to /api/audit/ingest with its own ApiKey.
  { sourceAppKey: "cleard", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "medium" },
  { sourceAppKey: "proposal", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "medium" },
  { sourceAppKey: "pricing", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "high" },
  { sourceAppKey: "finance", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "high" },
  { sourceAppKey: "vetted", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "medium" },
  { sourceAppKey: "mactech-core", targetAppKey: "identity-command-center", dependencyType: "api_calls", description: "POST /api/audit/ingest", criticality: "medium" },

  // Suite-as-registry fanout for the apps the original seed missed.
  { sourceAppKey: "identity-command-center", targetAppKey: "cleard", dependencyType: "shared_component", description: "Suite tracks cleard in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "opportunities", dependencyType: "shared_component", description: "Suite tracks opportunities in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "proposal", dependencyType: "shared_component", description: "Suite tracks proposal in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "pricing", dependencyType: "shared_component", description: "Suite tracks pricing in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "finance", dependencyType: "shared_component", description: "Suite tracks finance in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "bizops", dependencyType: "shared_component", description: "Suite tracks bizops in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "contracts-delivery", dependencyType: "shared_component", description: "Suite tracks contracts-delivery in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "client-portal", dependencyType: "shared_component", description: "Suite tracks client-portal in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "vetted", dependencyType: "shared_component", description: "Suite tracks vetted in AppRegistry + entitlements", criticality: "medium" },
  { sourceAppKey: "identity-command-center", targetAppKey: "mactech-core", dependencyType: "shared_component", description: "Suite tracks mactech-core in AppRegistry + entitlements", criticality: "low" },

  // Webhooks → Suite. Combined GitHub + Railway flows per app since
  // the (source, target, dependencyType) unique constraint allows only
  // one webhook_source edge per pair. Description lists every wired
  // flow so the operator knows the full ingest surface at a glance.
  // GitHub webhooks were configured via gh api hooks during slice 2
  // for every app with a repoFullName. Railway webhooks were
  // manually configured on the Railway project Settings → Webhooks
  // page (Railway API does not expose CRUD); currently set on QMS,
  // Governance, MacTech Training, and MacTech_Suite. Self-edge
  // (suite → suite) is omitted from the visual graph.
  { sourceAppKey: "growth-capture", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub push + workflow_run → /api/webhooks/github", criticality: "high" },
  { sourceAppKey: "codex", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub push + workflow_run → /api/webhooks/github", criticality: "high" },
  { sourceAppKey: "training", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub + Railway lifecycle webhooks → Suite ingest", criticality: "high" },
  { sourceAppKey: "quality", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub + Railway lifecycle webhooks → Suite ingest", criticality: "high" },
  { sourceAppKey: "governance", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub + Railway lifecycle webhooks → Suite ingest", criticality: "high" },
  { sourceAppKey: "enclavewatch", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub push + workflow_run → /api/webhooks/github", criticality: "high" },
  { sourceAppKey: "proposal", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub push + workflow_run → /api/webhooks/github", criticality: "medium" },
  { sourceAppKey: "finance", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub push + workflow_run → /api/webhooks/github", criticality: "high" },
  { sourceAppKey: "vetted", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub push + workflow_run → /api/webhooks/github", criticality: "medium" },
  { sourceAppKey: "mactech-core", targetAppKey: "identity-command-center", dependencyType: "webhook_source", description: "GitHub push + workflow_run → /api/webhooks/github", criticality: "low" },
];

async function seedAppDependencies() {
  for (const d of APP_DEPENDENCIES) {
    const [src, tgt] = await Promise.all([
      prisma.appRegistry.findUnique({ where: { appKey: d.sourceAppKey }, select: { id: true } }),
      prisma.appRegistry.findUnique({ where: { appKey: d.targetAppKey }, select: { id: true } }),
    ]);
    if (!src || !tgt) {
      console.warn(
        `  skip dependency ${d.sourceAppKey} → ${d.targetAppKey} (${d.dependencyType}): missing app`,
      );
      continue;
    }
    await prisma.appDependency.upsert({
      where: {
        sourceAppRegistryId_targetAppRegistryId_dependencyType: {
          sourceAppRegistryId: src.id,
          targetAppRegistryId: tgt.id,
          dependencyType: d.dependencyType,
        },
      },
      create: {
        sourceAppRegistryId: src.id,
        targetAppRegistryId: tgt.id,
        dependencyType: d.dependencyType,
        description: d.description,
        criticality: d.criticality,
      },
      update: {
        description: d.description,
        criticality: d.criticality,
      },
    });
  }
}

async function main() {
  console.log("🌱 Seeding MacTech Suite Command Center fixtures...");
  await seedApps();
  console.log("✓ App registry seeded");
  await seedServiceIdentities();
  console.log("✓ Service identities seeded");
  await seedAppDependencies();
  console.log("✓ App dependencies seeded");
  await seedRoleTemplates();
  console.log("✓ Role templates seeded");
  await seedLegacyTenant();
  console.log("✓ Legacy tenant scaffold seeded");
  await seedLegacyApiKey();
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
