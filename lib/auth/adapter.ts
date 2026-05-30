/**
 * Deprecated legacy tenant compatibility adapter.
 * 
 * This module creates a 'clean room' where the application only cares about
 * internalUserId and tenantId. External identity providers (Clerk, Google)
 * are resolved into internal MacTech abstractions at the boundary.
 * 
 * Hub Authority Contract v1 runtime access decisions must use the canonical
 * Hub models through /api/hub/authority/resolve-app-access. This adapter only
 * preserves the original Tenant/User/Membership read path for legacy callers
 * until those callers migrate to Hub authority snapshots.
 * 
 * Critical Constraint: No Clerk IDs leak into business services.
 * All downstream code uses internal MacTech identifiers only.
 */

import { auth } from '@clerk/nextjs/server';
import { prisma } from '../db/prisma';
import { MembershipRole } from '@prisma/client';

/**
 * MacTechAuthContext
 * 
 * The canonical internal authorization context used throughout the application.
 * This contains NO external provider IDs (no Clerk user_id, no Clerk org_id).
 */
export interface MacTechAuthContext {
  internalUserId: string;  // MacTech User.id (NOT Clerk user_id)
  tenantId: string;        // MacTech Tenant.id (NOT Clerk org_id)
  membershipId: string;    // MacTech Membership.id
  role: MembershipRole;    // Role within this tenant context
  membershipStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  email: string;
  name?: string;
}

/**
 * AuthAdapter Interface
 * 
 * Defines the contract for resolving external sessions into internal context.
 */
export interface AuthAdapter {
  resolveSession(): Promise<MacTechAuthContext | null>;
}

/**
 * ClerkAuthAdapter
 * 
 * Resolves Clerk sessions into MacTechAuthContext.
 * This is the ONLY place where Clerk types are referenced.
 */
export class ClerkAuthAdapter implements AuthAdapter {
  async resolveSession(): Promise<MacTechAuthContext | null> {
    // Get Clerk session (external provider)
    const clerkSession = await auth();
    
    if (!clerkSession.userId) {
      return null; // No authenticated user
    }
    
    // Extract Clerk identifiers (external)
    const clerkUserId = clerkSession.userId;
    const clerkOrgId = clerkSession.orgId; // May be null if no active org
    
    if (!clerkOrgId) {
      // User is authenticated but has no active tenant/org selected
      return null;
    }
    
    // Resolve external IDs to internal MacTech IDs via database lookup
    // This is the critical bridge: Clerk IDs -> MacTech IDs
    const membership = await prisma.membership.findFirst({
      where: {
        user: {
          externalId: clerkUserId, // Lookup by Clerk ID
        },
        tenant: {
          externalId: clerkOrgId,  // Lookup by Clerk org ID
        },
        isActive: true,
      },
      include: {
        user: true,
        tenant: true,
      },
    });
    
    if (!membership) {
      // Valid Clerk session, but no internal membership found
      // This is a fail-closed scenario: authenticated but unauthorized
      return null;
    }
    
    // Construct the internal MacTech context
    // From this point forward, NO Clerk IDs are used
    return {
      internalUserId: membership.user.id,      // MacTech User.id
      tenantId: membership.tenant.id,          // MacTech Tenant.id
      membershipId: membership.id,             // MacTech Membership.id
      role: membership.role,                   // MembershipRole enum
      membershipStatus: membership.isActive ? 'ACTIVE' : 'INACTIVE',
      email: membership.user.email,
      name: membership.user.name || undefined,
    };
  }
}

/**
 * Factory function for AuthAdapter
 * Currently returns ClerkAuthAdapter, but can be swapped in the future.
 */
export function createAuthAdapter(): AuthAdapter {
  return new ClerkAuthAdapter();
}

/**
 * Convenience function to get current MacTech auth context
 * Use this in API routes and server components
 */
export async function getMacTechAuthContext(): Promise<MacTechAuthContext | null> {
  const adapter = createAuthAdapter();
  return adapter.resolveSession();
}

/**
 * Error thrown when auth context is required but not available
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized: Valid MacTech membership required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error thrown when a user has a valid external session
 * but no internal MacTech membership (fail-closed scenario)
 */
export class MembershipRequiredError extends Error {
  constructor(message = 'Membership required: No active tenant membership found') {
    super(message);
    this.name = 'MembershipRequiredError';
  }
}
