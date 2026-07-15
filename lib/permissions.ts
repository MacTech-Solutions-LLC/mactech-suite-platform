/**
 * Permission constants for both authority planes (platform + customer org).
 *
 * Centralizing them here keeps the authz helpers, role templates, and UI
 * consistent. Anything that grants access must reference these strings —
 * we never compare against magic literals scattered across services.
 */

import type { PlatformRole } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM (MacTech internal admin) PERMISSIONS
// ──────────────────────────────────────────────────────────────────────────────

export const PLATFORM_PERMISSIONS = {
  DASHBOARD_VIEW: "platform:dashboard:view",
  MACTECH_USERS_MANAGE: "platform:mactech_users:manage",
  CUSTOMER_ORGS_CREATE: "platform:customer_orgs:create",
  CUSTOMER_ORGS_UPDATE: "platform:customer_orgs:update",
  CUSTOMER_ORGS_DISABLE: "platform:customer_orgs:disable",
  CUSTOMER_USERS_INVITE: "platform:customer_users:invite",
  CUSTOMER_USERS_REMOVE: "platform:customer_users:remove",
  ENTITLEMENTS_MANAGE: "platform:entitlements:manage",
  ROLES_VIEW: "platform:roles:view",
  ROLES_MANAGE: "platform:roles:manage",
  AUDIT_LOGS_VIEW: "platform:audit_logs:view",
  SECURITY_EVENTS_VIEW: "platform:security_events:view",
  APP_REGISTRY_MANAGE: "platform:app_registry:manage",
  SETTINGS_MANAGE: "platform:settings:manage",
  /** Submit a time-boxed IP-allowlist grant request to a vault edge.
   *  Held by the cui_auditor role and (transitively, via Object.values)
   *  by mactech_super_admin. */
  VAULT_ALLOWLIST_REQUEST: "platform:vault_allowlist:request",

  // ── Command Center ──────────────────────────────────────────────────────
  // Suite IS the product; Command Center IS the flagship capability. These
  // permissions gate the operational surface that lets internal admins see
  // ecosystem health, deployment drift, repository intelligence, and
  // operational risk across every MacTech app.
  COMMAND_CENTER_VIEW: "platform:command_center:view",
  COMMAND_CENTER_MANAGE: "platform:command_center:manage",
  // Sprint 53 — Design Surface (/admin/design).
  // DESIGN_VIEW lets a user see the design-system adoption state of
  // every app in the suite. Grants by default to mactech_admin /
  // design-lead / product-owner. Pure read; mutations live behind
  // DESIGN_MANAGE (theme preview is preview-only in v0.5.1; PR
  // generation arrives in v0.5.2+).
  DESIGN_VIEW: "platform:design:view",
  DESIGN_MANAGE: "platform:design:manage",
  OPS_VIEW: "platform:ops:view",
  OPS_MANAGE: "platform:ops:manage",
  REPOSITORIES_VIEW: "platform:repositories:view",
  REPOSITORIES_MANAGE: "platform:repositories:manage",
  DEPLOYMENTS_VIEW: "platform:deployments:view",
  DEPLOYMENTS_MANAGE: "platform:deployments:manage",
  INTEGRATIONS_VIEW: "platform:integrations:view",
  INTEGRATIONS_MANAGE: "platform:integrations:manage",
  RISK_VIEW: "platform:risk:view",
  RISK_MANAGE: "platform:risk:manage",
  SUBDOMAINS_VIEW: "platform:subdomains:view",
  SUBDOMAINS_MANAGE: "platform:subdomains:manage",

  // ── AgentOps (Slice 5) ──────────────────────────────────────────────────
  // Natural-language agent runtime. The plan-first / approval-gated /
  // separation-of-duties model is enforced at the service layer, not just
  // the route — see docs/AGENT_OPS.md for the full contract.
  //
  // VIEW: see runs + plans + artifacts (read-only).
  // CREATE: type a request, get a plan back, execute read-only steps.
  // APPROVE: turn an awaiting_approval run into approved + executable.
  //          Cannot self-approve a run you requested (separation of
  //          duties enforced inside the service).
  // MANAGE: cancel a run, force-fail a stuck run, super-admin only.
  AGENTS_VIEW: "platform:agents:view",
  AGENTS_CREATE: "platform:agents:create",
  AGENTS_APPROVE: "platform:agents:approve",
  AGENTS_MANAGE: "platform:agents:manage",

  // ── Commercial Operations ───────────────────────────────────────────────
  // The hub surface for the buyer journey: catalog (Packages),
  // transactions (Orders), recurring billing (Subscriptions), and the
  // QBO integration that powers it. View permissions are wide (support
  // + auditor see these); MANAGE is narrower.
  PACKAGES_VIEW: "platform:packages:view",
  PACKAGES_MANAGE: "platform:packages:manage",
  ORDERS_VIEW: "platform:orders:view",
  ORDERS_MANAGE: "platform:orders:manage",
  SUBSCRIPTIONS_VIEW: "platform:subscriptions:view",
  SUBSCRIPTIONS_MANAGE: "platform:subscriptions:manage",
  QUICKBOOKS_MANAGE: "platform:quickbooks:manage",
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

// ──────────────────────────────────────────────────────────────────────────────
// CUSTOMER ORG PERMISSIONS
// ──────────────────────────────────────────────────────────────────────────────

export const ORG_PERMISSIONS = {
  DASHBOARD_VIEW: "org:dashboard:view",
  USERS_VIEW: "org:users:view",
  USERS_INVITE: "org:users:invite",
  USERS_REMOVE: "org:users:remove",
  ROLES_ASSIGN: "org:roles:assign",
  VAULT_READ: "org:vault:read",
  VAULT_WRITE: "org:vault:write",
  VAULT_ADMIN: "org:vault:admin",
  EVIDENCE_READ: "org:evidence:read",
  EVIDENCE_CREATE: "org:evidence:create",
  EVIDENCE_APPROVE: "org:evidence:approve",
  EVIDENCE_EXPORT: "org:evidence:export",
  BOUNDARY_READ: "org:boundary:read",
  BOUNDARY_WRITE: "org:boundary:write",
  CAPTURE_READ: "org:capture:read",
  CAPTURE_WRITE: "org:capture:write",
  REPORTS_EXPORT: "org:reports:export",
  AUDIT_VIEW: "org:audit:view",
  SETTINGS_MANAGE: "org:settings:manage",

  // ── Suite app domains (SUITE_PERMISSION_MATRIX v1) ──────────────────────
  // Proposals (Proposal app)
  PROPOSALS_READ: "org:proposals:read",
  PROPOSALS_WRITE: "org:proposals:write",
  PROPOSALS_SUBMIT: "org:proposals:submit",
  // QMS (quality)
  QMS_READ: "org:qms:read",
  QMS_WRITE: "org:qms:write",
  QMS_REVIEW_READ: "org:qms:review:read",
  QMS_REVIEW_APPROVE: "org:qms:review:approve",
  // Finance
  FINANCE_READ: "org:finance:read",
  FINANCE_WRITE: "org:finance:write",
  FINANCE_RATES_READ: "org:finance:rates:read",
  FINANCE_RATES_WRITE: "org:finance:rates:write",
  FINANCE_INVOICE_READ: "org:finance:invoice:read",
  FINANCE_INVOICE_CREATE: "org:finance:invoice:create",
  FINANCE_INVOICE_APPROVE: "org:finance:invoice:approve",
  FINANCE_TIME_ENTER: "finance:time:enter",
  FINANCE_TIME_APPROVE: "finance:time:approve",
  FINANCE_CHARGE_CODES_MANAGE: "finance:charge_codes:manage",
  FINANCE_LABOR_DISTRIBUTION_POST: "finance:labor_distribution:post",
  FINANCE_ACCOUNTING_EXPORT: "finance:accounting:export",
  // Contracts (Contracts & Delivery) — org-level visibility; per-contract
  // detail is gated by the contract:* namespace below.
  CONTRACTS_READ: "org:contracts:read",
  CONTRACTS_WRITE: "org:contracts:write",
  CONTRACTS_MOD_MANAGE: "org:contracts:mod:manage",
  // Training
  TRAINING_READ: "org:training:read",
  TRAINING_ASSIGN: "org:training:assign",
  TRAINING_CERTIFY: "org:training:certify",
  // Connectors — SENSITIVE: owner-default. Never grant below customer_owner
  // in platform defaults (BizOps UI highlights these). See matrix §5.
  CONNECTORS_AI_MANAGE: "org:connectors:ai:manage",
  CONNECTORS_QUICKBOOKS_MANAGE: "org:connectors:quickbooks:manage",
  // GovCon Ops (bizops) — capture / bid / proposal / SBIR / readiness workspace.
  GOVCON_VIEW: "org:govcon:view",
  GOVCON_CREATE: "org:govcon:create",
  GOVCON_EDIT: "org:govcon:edit",
  GOVCON_ARCHIVE: "org:govcon:archive",
  GOVCON_ADMIN: "org:govcon:admin",
  GOVCON_PIPELINE_VIEW: "org:govcon:pipeline:view",
  GOVCON_FINANCIAL_VIEW: "org:govcon:financial:view",
  GOVCON_FINANCIAL_EDIT: "org:govcon:financial:edit",
  GOVCON_CAPTURE_MANAGE: "org:govcon:capture:manage",
  GOVCON_BID_DECISION_REVIEW: "org:govcon:bid:review",
  GOVCON_BID_DECISION_APPROVE: "org:govcon:bid:approve",
  GOVCON_PROPOSAL_MANAGE: "org:govcon:proposal:manage",
  GOVCON_PROPOSAL_REVIEW: "org:govcon:proposal:review",
  GOVCON_SBIR_MANAGE: "org:govcon:sbir:manage",
  GOVCON_PARTNERS_MANAGE: "org:govcon:partners:manage",
  GOVCON_CONTACTS_MANAGE: "org:govcon:contacts:manage",
  GOVCON_TASKS_MANAGE: "org:govcon:tasks:manage",
  GOVCON_DOCUMENTS_MANAGE: "org:govcon:documents:manage",
  GOVCON_READINESS_MANAGE: "org:govcon:readiness:manage",
  GOVCON_REPORTS_VIEW: "org:govcon:reports:view",
  GOVCON_EXPORT: "org:govcon:export",
} as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[keyof typeof ORG_PERMISSIONS];

// ──────────────────────────────────────────────────────────────────────────────
// CONTRACT-SCOPED PERMISSIONS (`contract:*` namespace)
// Distinct from org:* — granted via contractMembership (Phase 1), resolved
// per-contract. Effective contract perm = org-role perms + contract-scoped
// role perms for that specific contract. See SUITE_PERMISSION_MATRIX §3.
// ──────────────────────────────────────────────────────────────────────────────

export const CONTRACT_PERMISSIONS = {
  DOCS_READ: "contract:docs:read",
  DOCS_WRITE: "contract:docs:write",
  CDRL_READ: "contract:cdrl:read",
  CDRL_UPDATE: "contract:cdrl:update",
  FINANCE_READ: "contract:finance:read",
  FINANCE_WRITE: "contract:finance:write",
  MOD_APPROVE: "contract:mod:approve",
  MEMBERSHIP_MANAGE: "contract:membership:manage",
} as const;

export type ContractPermission =
  (typeof CONTRACT_PERMISSIONS)[keyof typeof CONTRACT_PERMISSIONS];

// ──────────────────────────────────────────────────────────────────────────────
// ROLE → PERMISSION MAPPINGS
// These are the system role templates seeded into RoleTemplate.
// ──────────────────────────────────────────────────────────────────────────────

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  mactech_super_admin: Object.values(PLATFORM_PERMISSIONS),
  mactech_admin: [
    PLATFORM_PERMISSIONS.DASHBOARD_VIEW,
    PLATFORM_PERMISSIONS.CUSTOMER_ORGS_CREATE,
    PLATFORM_PERMISSIONS.CUSTOMER_ORGS_UPDATE,
    PLATFORM_PERMISSIONS.CUSTOMER_ORGS_DISABLE,
    PLATFORM_PERMISSIONS.CUSTOMER_USERS_INVITE,
    PLATFORM_PERMISSIONS.CUSTOMER_USERS_REMOVE,
    PLATFORM_PERMISSIONS.ENTITLEMENTS_MANAGE,
    PLATFORM_PERMISSIONS.ROLES_VIEW,
    PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW,
    PLATFORM_PERMISSIONS.SECURITY_EVENTS_VIEW,
    PLATFORM_PERMISSIONS.APP_REGISTRY_MANAGE,
    PLATFORM_PERMISSIONS.COMMAND_CENTER_VIEW,
    PLATFORM_PERMISSIONS.COMMAND_CENTER_MANAGE,
    PLATFORM_PERMISSIONS.DESIGN_VIEW,
    PLATFORM_PERMISSIONS.DESIGN_MANAGE,
    PLATFORM_PERMISSIONS.OPS_VIEW,
    PLATFORM_PERMISSIONS.OPS_MANAGE,
    PLATFORM_PERMISSIONS.REPOSITORIES_VIEW,
    PLATFORM_PERMISSIONS.REPOSITORIES_MANAGE,
    PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW,
    PLATFORM_PERMISSIONS.DEPLOYMENTS_MANAGE,
    PLATFORM_PERMISSIONS.INTEGRATIONS_VIEW,
    PLATFORM_PERMISSIONS.INTEGRATIONS_MANAGE,
    PLATFORM_PERMISSIONS.RISK_VIEW,
    PLATFORM_PERMISSIONS.RISK_MANAGE,
    PLATFORM_PERMISSIONS.SUBDOMAINS_VIEW,
    PLATFORM_PERMISSIONS.SUBDOMAINS_MANAGE,
    // AgentOps: admins can view, create, and approve. Manage (cancel /
    // force-fail) is super-admin only — admins should not be able to
    // unilaterally hide a run they already approved.
    PLATFORM_PERMISSIONS.AGENTS_VIEW,
    PLATFORM_PERMISSIONS.AGENTS_CREATE,
    PLATFORM_PERMISSIONS.AGENTS_APPROVE,
    // Commercial Operations: admins manage catalog + orders + subs.
    // QBO mutate (reconnect / disconnect) is super-admin only via
    // Object.values mapping above.
    PLATFORM_PERMISSIONS.PACKAGES_VIEW,
    PLATFORM_PERMISSIONS.PACKAGES_MANAGE,
    PLATFORM_PERMISSIONS.ORDERS_VIEW,
    PLATFORM_PERMISSIONS.ORDERS_MANAGE,
    PLATFORM_PERMISSIONS.SUBSCRIPTIONS_VIEW,
    PLATFORM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
  ],
  mactech_support: [
    PLATFORM_PERMISSIONS.DASHBOARD_VIEW,
    PLATFORM_PERMISSIONS.CUSTOMER_USERS_INVITE,
    PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW,
    PLATFORM_PERMISSIONS.SECURITY_EVENTS_VIEW,
    PLATFORM_PERMISSIONS.ROLES_VIEW,
    // Read-only ecosystem visibility — support owns triage but does not
    // mutate registry / repo / deployment / integration state.
    PLATFORM_PERMISSIONS.COMMAND_CENTER_VIEW,
    PLATFORM_PERMISSIONS.OPS_VIEW,
    PLATFORM_PERMISSIONS.REPOSITORIES_VIEW,
    PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW,
    PLATFORM_PERMISSIONS.RISK_VIEW,
    PLATFORM_PERMISSIONS.SUBDOMAINS_VIEW,
    // Read-only visibility into the agent run history; support owns
    // triage and needs to see what an admin asked the agent to do.
    PLATFORM_PERMISSIONS.AGENTS_VIEW,
    PLATFORM_PERMISSIONS.PACKAGES_VIEW,
    PLATFORM_PERMISSIONS.ORDERS_VIEW,
    PLATFORM_PERMISSIONS.SUBSCRIPTIONS_VIEW,
  ],
  mactech_auditor: [
    PLATFORM_PERMISSIONS.DASHBOARD_VIEW,
    PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW,
    PLATFORM_PERMISSIONS.SECURITY_EVENTS_VIEW,
    PLATFORM_PERMISSIONS.ROLES_VIEW,
    // Auditors see Command Center + open risks for assessor-facing
    // narratives, but never touch a mutation.
    PLATFORM_PERMISSIONS.COMMAND_CENTER_VIEW,
    PLATFORM_PERMISSIONS.RISK_VIEW,
    // Auditors must be able to read every agent run history for
    // assessor replay — but never approve or create.
    PLATFORM_PERMISSIONS.AGENTS_VIEW,
  ],
  mactech_read_only: [
    PLATFORM_PERMISSIONS.DASHBOARD_VIEW,
    PLATFORM_PERMISSIONS.ROLES_VIEW,
    PLATFORM_PERMISSIONS.COMMAND_CENTER_VIEW,
  ],
  // External C3PAO assessor. Sees the auditor-access portal and their
  // own grant audit history — nothing else of the admin surface.
  cui_auditor: [
    PLATFORM_PERMISSIONS.VAULT_ALLOWLIST_REQUEST,
    PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW,
  ],
  none: [],
};

export const CUSTOMER_ROLE_DEFINITIONS: Array<{
  key: string;
  name: string;
  description: string;
  permissions: OrgPermission[];
}> = [
  {
    key: "customer_owner",
    name: "Customer Owner",
    description:
      "Full authority within the customer organization, including settings and billing.",
    permissions: Object.values(ORG_PERMISSIONS),
  },
  {
    key: "customer_admin",
    name: "Customer Admin",
    description: "Manages users, roles, and access across enabled MacTech apps.",
    // Matrix §2: all customer_owner permissions EXCEPT vault:admin and the
    // owner-only connector management. Filter keeps it in sync as domains grow.
    permissions: Object.values(ORG_PERMISSIONS).filter(
      (p) =>
        p !== ORG_PERMISSIONS.VAULT_ADMIN &&
        p !== ORG_PERMISSIONS.CONNECTORS_AI_MANAGE &&
        p !== ORG_PERMISSIONS.CONNECTORS_QUICKBOOKS_MANAGE,
    ),
  },
  {
    key: "compliance_manager",
    name: "Compliance Manager",
    description: "Owns the compliance program, evidence approvals, and reporting exports.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.USERS_VIEW,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.EVIDENCE_CREATE,
      ORG_PERMISSIONS.EVIDENCE_APPROVE,
      ORG_PERMISSIONS.EVIDENCE_EXPORT,
      ORG_PERMISSIONS.BOUNDARY_READ,
      ORG_PERMISSIONS.REPORTS_EXPORT,
      ORG_PERMISSIONS.AUDIT_VIEW,
      // Matrix §2: compliance extends into QMS review (CDRL compliance overlap)
      ORG_PERMISSIONS.QMS_READ,
      ORG_PERMISSIONS.QMS_REVIEW_READ,
    ],
  },
  {
    key: "security_manager",
    name: "Security Manager",
    description: "Owns security boundary, vault administration, and incident response context.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.USERS_VIEW,
      ORG_PERMISSIONS.VAULT_READ,
      ORG_PERMISSIONS.VAULT_WRITE,
      ORG_PERMISSIONS.VAULT_ADMIN,
      ORG_PERMISSIONS.BOUNDARY_READ,
      ORG_PERMISSIONS.BOUNDARY_WRITE,
      ORG_PERMISSIONS.AUDIT_VIEW,
    ],
  },
  {
    key: "evidence_contributor",
    name: "Evidence Contributor",
    description: "Uploads and edits evidence artifacts; cannot approve or export.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.EVIDENCE_CREATE,
      ORG_PERMISSIONS.VAULT_READ,
      ORG_PERMISSIONS.BOUNDARY_READ,
      // Matrix §2: read QMS + Proposals where evidence feeds compliance matrices
      ORG_PERMISSIONS.QMS_READ,
      ORG_PERMISSIONS.PROPOSALS_READ,
    ],
  },
  // DEPRECATED — superseded by the four audit-type variants below. Retained
  // so existing `auditor` assignments keep resolving until they are migrated
  // to a specific variant (rollout Step 4 analogue). Do not assign to new users.
  {
    key: "auditor",
    name: "Auditor (deprecated)",
    description: "Deprecated generic auditor. Use a cmmc_l2/iso9001/iso27001/dcaa variant.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.EVIDENCE_EXPORT,
      ORG_PERMISSIONS.BOUNDARY_READ,
      ORG_PERMISSIONS.REPORTS_EXPORT,
      ORG_PERMISSIONS.AUDIT_VIEW,
    ],
  },
  // Matrix §2 — Auditor family. Each variant is read-only and scoped to its
  // audit type (org:audit:view is filtered per role in the query layer — see
  // Step 5 of the rollout plan).
  {
    key: "cmmc_l2_auditor",
    name: "CMMC Level 2 Auditor",
    description: "Read-only access for CMMC L2 assessment: access control + evidence.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.EVIDENCE_EXPORT,
      ORG_PERMISSIONS.BOUNDARY_READ,
      ORG_PERMISSIONS.VAULT_READ,
      ORG_PERMISSIONS.AUDIT_VIEW,
      ORG_PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    key: "iso27001_auditor",
    name: "ISO 27001 Auditor",
    description: "Security-focused ISO; overlaps CMMC L2 (access control + evidence).",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.EVIDENCE_EXPORT,
      ORG_PERMISSIONS.BOUNDARY_READ,
      ORG_PERMISSIONS.VAULT_READ,
      ORG_PERMISSIONS.AUDIT_VIEW,
      ORG_PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    key: "iso9001_auditor",
    name: "ISO 9001 Auditor",
    description: "Read-only access for ISO 9001 quality audit: QMS doc/review history.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.EVIDENCE_EXPORT,
      ORG_PERMISSIONS.QMS_READ,
      ORG_PERMISSIONS.QMS_REVIEW_READ,
      ORG_PERMISSIONS.AUDIT_VIEW,
      ORG_PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    key: "dcaa_auditor",
    name: "DCAA Auditor",
    description: "Read-only access for DCAA: timekeeping + financial transactions.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.FINANCE_READ,
      ORG_PERMISSIONS.FINANCE_INVOICE_READ,
      ORG_PERMISSIONS.FINANCE_RATES_READ,
      ORG_PERMISSIONS.CONTRACTS_READ,
      ORG_PERMISSIONS.AUDIT_VIEW,
      ORG_PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    key: "read_only_user",
    name: "Read Only User",
    description: "Baseline visibility into dashboards and read-only views of org artifacts.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.VAULT_READ,
      ORG_PERMISSIONS.BOUNDARY_READ,
      ORG_PERMISSIONS.CAPTURE_READ,
      // Matrix §2: baseline cross-app read (finance intentionally excluded)
      ORG_PERMISSIONS.CONTRACTS_READ,
      ORG_PERMISSIONS.PROPOSALS_READ,
      ORG_PERMISSIONS.QMS_READ,
    ],
  },

  // ── New operational roles (Matrix §2) ───────────────────────────────────
  {
    key: "capture_manager",
    name: "Capture Manager",
    description: "Owns pipeline / bid-no-bid; reads proposals for handoff.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.CAPTURE_READ,
      ORG_PERMISSIONS.CAPTURE_WRITE,
      ORG_PERMISSIONS.PROPOSALS_READ,
    ],
  },
  {
    key: "proposal_manager",
    name: "Proposal Manager",
    description: "Owns proposal development and submission; reads capture + QMS.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.PROPOSALS_READ,
      ORG_PERMISSIONS.PROPOSALS_WRITE,
      ORG_PERMISSIONS.PROPOSALS_SUBMIT,
      ORG_PERMISSIONS.CAPTURE_READ,
      ORG_PERMISSIONS.QMS_READ,
    ],
  },
  {
    key: "qms_manager",
    name: "QMS Manager",
    description: "Owns quality management: controlled docs and review approvals.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.QMS_READ,
      ORG_PERMISSIONS.QMS_WRITE,
      ORG_PERMISSIONS.QMS_REVIEW_APPROVE,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.EVIDENCE_CREATE,
    ],
  },
  {
    key: "finance_manager",
    name: "Finance Manager",
    description: "Owns rates, timekeeping controls, labor distribution, accounting exports, and invoicing. Connector management stays owner-only.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.FINANCE_READ,
      ORG_PERMISSIONS.FINANCE_RATES_WRITE,
      ORG_PERMISSIONS.FINANCE_INVOICE_CREATE,
      ORG_PERMISSIONS.FINANCE_INVOICE_APPROVE,
      ORG_PERMISSIONS.FINANCE_TIME_ENTER,
      ORG_PERMISSIONS.FINANCE_TIME_APPROVE,
      ORG_PERMISSIONS.FINANCE_CHARGE_CODES_MANAGE,
      ORG_PERMISSIONS.FINANCE_LABOR_DISTRIBUTION_POST,
      ORG_PERMISSIONS.FINANCE_ACCOUNTING_EXPORT,
      ORG_PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    key: "contracts_manager",
    name: "Contracts Manager",
    description: "Owns awarded-contract records, CLINs, and mods.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.CONTRACTS_READ,
      ORG_PERMISSIONS.CONTRACTS_WRITE,
      ORG_PERMISSIONS.CONTRACTS_MOD_MANAGE,
      ORG_PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  {
    key: "training_manager",
    name: "Training Manager",
    description: "Owns training assignments and certifications.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.TRAINING_READ,
      ORG_PERMISSIONS.TRAINING_ASSIGN,
      ORG_PERMISSIONS.TRAINING_CERTIFY,
      ORG_PERMISSIONS.USERS_VIEW,
    ],
  },
  {
    key: "program_manager",
    name: "Program Manager",
    description:
      "Cross-cutting read across delivery areas; write is granted per-contract, not here.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.FINANCE_READ,
      ORG_PERMISSIONS.CONTRACTS_READ,
      ORG_PERMISSIONS.PROPOSALS_READ,
      ORG_PERMISSIONS.QMS_READ,
      ORG_PERMISSIONS.TRAINING_READ,
    ],
  },
  {
    key: "govcon_manager",
    name: "GovCon Capture Manager",
    description:
      "Runs the GovCon Ops (bizops) capture, bid, proposal, and readiness pipeline: full pursuit management including financials, bid approval, and export.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.GOVCON_VIEW,
      ORG_PERMISSIONS.GOVCON_CREATE,
      ORG_PERMISSIONS.GOVCON_EDIT,
      ORG_PERMISSIONS.GOVCON_ARCHIVE,
      ORG_PERMISSIONS.GOVCON_PIPELINE_VIEW,
      ORG_PERMISSIONS.GOVCON_FINANCIAL_VIEW,
      ORG_PERMISSIONS.GOVCON_FINANCIAL_EDIT,
      ORG_PERMISSIONS.GOVCON_CAPTURE_MANAGE,
      ORG_PERMISSIONS.GOVCON_BID_DECISION_REVIEW,
      ORG_PERMISSIONS.GOVCON_BID_DECISION_APPROVE,
      ORG_PERMISSIONS.GOVCON_PROPOSAL_MANAGE,
      ORG_PERMISSIONS.GOVCON_PROPOSAL_REVIEW,
      ORG_PERMISSIONS.GOVCON_SBIR_MANAGE,
      ORG_PERMISSIONS.GOVCON_PARTNERS_MANAGE,
      ORG_PERMISSIONS.GOVCON_CONTACTS_MANAGE,
      ORG_PERMISSIONS.GOVCON_TASKS_MANAGE,
      ORG_PERMISSIONS.GOVCON_DOCUMENTS_MANAGE,
      ORG_PERMISSIONS.GOVCON_READINESS_MANAGE,
      ORG_PERMISSIONS.GOVCON_REPORTS_VIEW,
      ORG_PERMISSIONS.GOVCON_EXPORT,
    ],
  },
  {
    key: "govcon_contributor",
    name: "GovCon Contributor",
    description:
      "Contributes to GovCon pursuits and proposals: create/edit records, capture, proposal review, tasks — no financial edits, bid approval, archive, or export.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.GOVCON_VIEW,
      ORG_PERMISSIONS.GOVCON_PIPELINE_VIEW,
      ORG_PERMISSIONS.GOVCON_CREATE,
      ORG_PERMISSIONS.GOVCON_EDIT,
      ORG_PERMISSIONS.GOVCON_FINANCIAL_VIEW,
      ORG_PERMISSIONS.GOVCON_CAPTURE_MANAGE,
      ORG_PERMISSIONS.GOVCON_PROPOSAL_REVIEW,
      ORG_PERMISSIONS.GOVCON_SBIR_MANAGE,
      ORG_PERMISSIONS.GOVCON_CONTACTS_MANAGE,
      ORG_PERMISSIONS.GOVCON_TASKS_MANAGE,
      ORG_PERMISSIONS.GOVCON_DOCUMENTS_MANAGE,
      ORG_PERMISSIONS.GOVCON_REPORTS_VIEW,
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// CONTRACT-SCOPED ROLE DEFINITIONS (Matrix §3)
// Attach via contractMembership, NOT the org role table. Effective permission
// on Contract X = org-role perms + the contract-scoped perms below for X.
// ──────────────────────────────────────────────────────────────────────────────

export const CONTRACT_ROLE_DEFINITIONS: Array<{
  key: string;
  name: string;
  description: string;
  permissions: ContractPermission[];
}> = [
  {
    key: "contract_owner",
    name: "Contract Owner",
    description: "Full authority on the contract incl. finance, mods, membership.",
    permissions: Object.values(CONTRACT_PERMISSIONS),
  },
  {
    key: "contract_cor",
    name: "COR",
    description: "Contracting Officer's Rep: read docs/finance, update CDRLs.",
    permissions: [
      CONTRACT_PERMISSIONS.DOCS_READ,
      CONTRACT_PERMISSIONS.CDRL_READ,
      CONTRACT_PERMISSIONS.CDRL_UPDATE,
      CONTRACT_PERMISSIONS.FINANCE_READ,
    ],
  },
  {
    key: "contract_pm",
    name: "Program Manager (contract)",
    description: "Delivery lead: write docs, update CDRLs, read finance.",
    permissions: [
      CONTRACT_PERMISSIONS.DOCS_READ,
      CONTRACT_PERMISSIONS.DOCS_WRITE,
      CONTRACT_PERMISSIONS.CDRL_READ,
      CONTRACT_PERMISSIONS.CDRL_UPDATE,
      CONTRACT_PERMISSIONS.FINANCE_READ,
    ],
  },
  {
    key: "contract_key_personnel",
    name: "Key Personnel",
    description: "Read docs + assigned CDRLs; update assigned CDRLs.",
    permissions: [
      CONTRACT_PERMISSIONS.DOCS_READ,
      CONTRACT_PERMISSIONS.CDRL_READ,
      CONTRACT_PERMISSIONS.CDRL_UPDATE,
    ],
  },
  {
    key: "contract_subcontractor",
    name: "Subcontractor",
    description: "Scoped to assigned docs/CDRLs only (Clerk guest org).",
    permissions: [
      CONTRACT_PERMISSIONS.DOCS_READ,
      CONTRACT_PERMISSIONS.CDRL_READ,
      CONTRACT_PERMISSIONS.CDRL_UPDATE,
    ],
  },
];

export const PLATFORM_ROLE_DEFINITIONS: Array<{
  key: PlatformRole;
  name: string;
  description: string;
  permissions: PlatformPermission[];
}> = [
  {
    key: "mactech_super_admin",
    name: "MacTech Super Admin",
    description: "Unrestricted control across the entire MacTech Suite.",
    permissions: PLATFORM_ROLE_PERMISSIONS.mactech_super_admin,
  },
  {
    key: "mactech_admin",
    name: "MacTech Admin",
    description: "Manages customer organizations, users, and entitlements.",
    permissions: PLATFORM_ROLE_PERMISSIONS.mactech_admin,
  },
  {
    key: "mactech_support",
    name: "MacTech Support",
    description:
      "Assists customers with onboarding and basic troubleshooting; cannot disable orgs.",
    permissions: PLATFORM_ROLE_PERMISSIONS.mactech_support,
  },
  {
    key: "mactech_auditor",
    name: "MacTech Auditor",
    description: "Read-only platform observer focused on audit logs and security events.",
    permissions: PLATFORM_ROLE_PERMISSIONS.mactech_auditor,
  },
  {
    key: "mactech_read_only",
    name: "MacTech Read Only",
    description: "Baseline read access for internal stakeholders.",
    permissions: PLATFORM_ROLE_PERMISSIONS.mactech_read_only,
  },
];

export function platformRoleHasPermission(
  role: PlatformRole,
  permission: PlatformPermission,
): boolean {
  return PLATFORM_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function platformRoleLabel(role: PlatformRole): string {
  switch (role) {
    case "mactech_super_admin":
      return "MacTech Super Admin";
    case "mactech_admin":
      return "MacTech Admin";
    case "mactech_support":
      return "MacTech Support";
    case "mactech_auditor":
      return "MacTech Auditor";
    case "mactech_read_only":
      return "MacTech Read Only";
    case "cui_auditor":
      return "CUI Auditor (C3PAO)";
    case "none":
    default:
      return "No Platform Access";
  }
}
