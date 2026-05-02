import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/access-restricted",
  "/api/webhooks/clerk",
  "/api/audit/ingest",
  "/api/v1/(.*)",
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/dashboard(.*)",
  "/governance(.*)",
  // /welcome is the post-sign-in router for customer users — needs an
  // active Clerk session but NOT a platform role (the page itself
  // routes internal MacTech vs customer users).
  "/welcome(.*)",
  // /app-launch resolves an entitlement before redirecting to the
  // sibling app — also needs auth.
  "/app-launch(.*)",
]);

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

  const res = NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/governance")) {
    res.headers.set("x-mactech-pathname", req.nextUrl.pathname);
  }
  return res;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)",
    "/(api|trpc)(.*)",
  ],
};
