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
} as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[keyof typeof ORG_PERMISSIONS];

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
  ],
  mactech_support: [
    PLATFORM_PERMISSIONS.DASHBOARD_VIEW,
    PLATFORM_PERMISSIONS.CUSTOMER_USERS_INVITE,
    PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW,
    PLATFORM_PERMISSIONS.SECURITY_EVENTS_VIEW,
    PLATFORM_PERMISSIONS.ROLES_VIEW,
  ],
  mactech_auditor: [
    PLATFORM_PERMISSIONS.DASHBOARD_VIEW,
    PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW,
    PLATFORM_PERMISSIONS.SECURITY_EVENTS_VIEW,
    PLATFORM_PERMISSIONS.ROLES_VIEW,
  ],
  mactech_read_only: [
    PLATFORM_PERMISSIONS.DASHBOARD_VIEW,
    PLATFORM_PERMISSIONS.ROLES_VIEW,
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
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.USERS_VIEW,
      ORG_PERMISSIONS.USERS_INVITE,
      ORG_PERMISSIONS.USERS_REMOVE,
      ORG_PERMISSIONS.ROLES_ASSIGN,
      ORG_PERMISSIONS.VAULT_READ,
      ORG_PERMISSIONS.VAULT_WRITE,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.EVIDENCE_CREATE,
      ORG_PERMISSIONS.EVIDENCE_APPROVE,
      ORG_PERMISSIONS.BOUNDARY_READ,
      ORG_PERMISSIONS.BOUNDARY_WRITE,
      ORG_PERMISSIONS.CAPTURE_READ,
      ORG_PERMISSIONS.CAPTURE_WRITE,
      ORG_PERMISSIONS.REPORTS_EXPORT,
      ORG_PERMISSIONS.AUDIT_VIEW,
      ORG_PERMISSIONS.SETTINGS_MANAGE,
    ],
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
    ],
  },
  {
    key: "auditor",
    name: "Auditor",
    description: "Read-only access to evidence, audit logs, and reports for assessment review.",
    permissions: [
      ORG_PERMISSIONS.DASHBOARD_VIEW,
      ORG_PERMISSIONS.EVIDENCE_READ,
      ORG_PERMISSIONS.EVIDENCE_EXPORT,
      ORG_PERMISSIONS.BOUNDARY_READ,
      ORG_PERMISSIONS.REPORTS_EXPORT,
      ORG_PERMISSIONS.AUDIT_VIEW,
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
    case "none":
    default:
      return "No Platform Access";
  }
}
