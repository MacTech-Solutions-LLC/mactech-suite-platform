/**
 * Proof-of-Scoping API Route
 * 
 * This route demonstrates the complete auth context flow:
 * 1. Retrieve session via AuthAdapter (resolves Clerk -> MacTech internal IDs)
 * 2. Pass context to withTenant (verifies ACTIVE membership)
 * 3. Perform database query using only internal MacTech identifiers
 * 4. Return tenant data
 * 
 * CRITICAL CONSTRAINTS:
 * - Does NOT accept tenantId from request body or query string
 * - Uses ONLY what Auth Context provides (internalUserId, tenantId)
 * - No Clerk IDs leak into the response or business logic
 */

import { NextResponse } from 'next/server';
import { getMacTechAuthContext, UnauthorizedError } from '../../../lib/auth/adapter';
import { withTenant, InactiveMembershipError, TenantIsolationError } from '../../../lib/db/withTenant';
import { prisma } from '../../../lib/db/prisma';

/**
 * GET /api/tenant
 * 
 * Returns the current tenant's name and slug.
 * 
 * Authentication: Required (via Clerk session)
 * Authorization: Requires ACTIVE membership in the tenant
 * 
 * The tenantId comes ONLY from the MacTechAuthContext, never from:
 * - Query parameters
 * - Request body
 * - Headers
 * - URL path
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Step 1: Retrieve session via AuthAdapter
    // This resolves the external Clerk session into internal MacTech context
    const authContext = await getMacTechAuthContext();
    
    // Step 2: Pass context to withTenant
    // withTenant verifies:
    // - authContext is not null (authentication)
    // - authContext.tenantId exists (tenant isolation)
    // - authContext.membershipStatus === 'ACTIVE' (authorization)
    const tenant = await withTenant(authContext, async (db) => {
      // Step 3: Perform database query using ONLY internal MacTech identifiers
      // We use authContext.tenantId (MacTech internal ID, NOT Clerk org_id)
      // TypeScript note: authContext is validated by withTenant, but TS doesn't know
      // We use non-null assertion (!) since withTenant throws if authContext is null
      return db.tenant.findUnique({
        where: {
          id: authContext!.tenantId, // Internal MacTech Tenant.id
        },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
    
    // After withTenant succeeds, authContext is guaranteed to be non-null
    if (!authContext) {
      // This should never happen due to withTenant validation, but TypeScript needs it
      throw new UnauthorizedError('Auth context lost after validation');
    }
    
    if (!tenant) {
      // This should not happen if membership check passed, but handle defensively
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }
    
    // Step 4: Return tenant data
    // Note: The response contains ONLY internal MacTech IDs
    // No Clerk IDs (user_id, org_id) are exposed
    return NextResponse.json({
      tenant: {
        id: tenant.id,              // MacTech Tenant.id
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      },
      // Include the internal user ID for client reference
      // This is the MacTech User.id, NOT the Clerk user_id
      user: {
        id: authContext!.internalUserId,
        role: authContext!.role,
      },
    });
    
  } catch (error) {
    // Handle specific error types from auth and tenant guards
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      );
    }
    
    if (error instanceof InactiveMembershipError) {
      return NextResponse.json(
        { error: 'Forbidden', message: error.message },
        { status: 403 }
      );
    }
    
    if (error instanceof TenantIsolationError) {
      return NextResponse.json(
        { error: 'Bad Request', message: error.message },
        { status: 400 }
      );
    }
    
    // Log unexpected errors (in production, use proper logging)
    console.error('[Tenant API] Unexpected error:', error);
    
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
