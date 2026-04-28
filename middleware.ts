import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/access-restricted",
  "/api/webhooks/clerk",
  "/api/audit/ingest",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)", "/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // For admin/dashboard routes we require an authenticated session at the
  // edge. Fine-grained platform-permission checks happen server-side in the
  // layouts and page actions via lib/authz.
  if (isAdminRoute(req)) {
    const session = await auth();
    if (!session.userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)",
    "/(api|trpc)(.*)",
  ],
};
