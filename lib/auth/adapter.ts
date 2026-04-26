/**
 * Auth Adapter Placeholder
 * 
 * This module wraps Clerk/Google identity calls to keep business logic
 * decoupled from specific identity providers. The goal is to allow
 * future provider swaps without touching application code.
 * 
 * TODO: Implement actual Clerk integration
 * TODO: Add session validation
 * TODO: Add tenant context extraction from session
 */

export interface AuthUser {
  id: string;           // Internal MacTech user ID
  externalId: string;   // Clerk user_id or Google sub
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthSession {
  user: AuthUser;
  tenantId?: string;    // Current active tenant from session
  membershipRole?: string;
}

/**
 * Placeholder: Get current session from request context
 * This will integrate with Clerk's getAuth() or similar
 */
export async function getSession(): Promise<AuthSession | null> {
  // TODO: Implement actual session retrieval from Clerk
  // For now, return null to enforce explicit auth checks
  return null;
}

/**
 * Placeholder: Extract tenant context from session
 * tenantId is an internal MacTech abstraction, NOT Clerk org_id
 */
export async function getTenantContext(session: AuthSession): Promise<{
  tenantId: string;
  role: string;
} | null> {
  if (!session.tenantId) {
    return null;
  }
  
  return {
    tenantId: session.tenantId,
    role: session.membershipRole || 'VIEWER',
  };
}

/**
 * Placeholder: Verify user has required permission
 */
export async function requirePermission(
  session: AuthSession,
  requiredRole: string
): Promise<boolean> {
  // TODO: Implement role hierarchy check
  // For now, deny all to enforce explicit permission checks
  return false;
}

/**
 * Placeholder: Map Clerk org_id to internal tenantId
 * This maintains the abstraction layer - we don't use Clerk org_id directly
 */
export async function resolveTenantId(clerkOrgId: string): Promise<string | null> {
  // TODO: Lookup tenant by externalId mapping
  // Returns internal MacTech tenantId, NOT the Clerk org_id
  return null;
}
