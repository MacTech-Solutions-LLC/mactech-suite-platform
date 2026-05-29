import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/access-restricted",
  // Public operational status page (Slice 11). Anonymous traffic only
  // sees the sanitized projection from getPublicStatus(); no auth
  // required. Served at /status and at status.suite.mactechsolutionsllc.com
  // (host CNAME → this app).
  "/status",
  "/api/health",
  "/api/build-info",
  "/api/webhooks/clerk",
  // GitHub webhook deliveries — auth is HMAC-SHA256 against
  // GITHUB_WEBHOOK_SECRET, verified inside the route. Skipping the
  // Clerk middleware here so the route runs at all.
  "/api/webhooks/github",
  // Railway webhook deliveries — verified via HMAC OR query secret
  // against RAILWAY_WEBHOOK_SECRET inside the route.
  "/api/webhooks/railway",
  // QuickBooks Online webhook deliveries — verified via HMAC-SHA256
  // against QBO_WEBHOOK_VERIFIER_TOKEN (X-Intuit-Signature header)
  // inside the route. Skipping Clerk auth so Intuit's POSTs reach us.
  "/api/webhooks/quickbooks",
  "/api/audit/ingest",
  "/api/v1/(.*)",
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/dashboard(.*)",
  // Command Center is the flagship operational surface — same auth
  // gate as /admin and /dashboard, lives under app/(admin)/command-center
  // so it inherits AdminShell automatically.
  "/command-center(.*)",
  "/governance(.*)",
  // /welcome is the post-sign-in router for customer users — needs an
  // active Clerk session but NOT a platform role (the page itself
  // routes internal MacTech vs customer users).
  "/welcome(.*)",
  // /app-launch resolves an entitlement before redirecting to the
  // sibling app — also needs auth.
  "/app-launch(.*)",
  // /auditor-access is the focused vault-IP-allowlist portal for
  // external CUI auditors (cui_auditor role). Auth required at the
  // edge; the page itself enforces the role.
  "/auditor-access(.*)",
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
      // Preserve the full original URL (pathname + query string) so that
      // Clerk-issued query params like `__clerk_ticket` survive the bounce
      // through /sign-in. Dropping the query here is how org-invitation
      // tickets used to end at a dead-end "Couldn't find your account".
      signInUrl.searchParams.set(
        "redirect_url",
        req.nextUrl.pathname + req.nextUrl.search,
      );
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
