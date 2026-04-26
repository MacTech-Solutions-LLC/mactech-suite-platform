/**
 * Next.js Middleware
 * 
 * Detects Clerk session and prepares MacTech authorization context.
 * This is a stub for future implementation.
 * 
 * Responsibilities:
 * 1. Validate authentication via Clerk
 * 2. Extract tenant context from session/org
 * 3. Attach tenantId to request for downstream use
 * 4. Enforce route-level access control
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // TODO: Implement Clerk session detection
  // TODO: Extract and validate tenant context
  // TODO: Attach tenantId to request headers or context
  // TODO: Redirect unauthenticated users to sign-in
  
  // For now, pass through to allow development
  return NextResponse.next();
}

/**
 * Configure which routes the middleware runs on
 * 
 * For now, exclude static files and public assets.
 * Apply to all API routes and protected pages.
 */
export const config = {
  matcher: [
    // Skip static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
