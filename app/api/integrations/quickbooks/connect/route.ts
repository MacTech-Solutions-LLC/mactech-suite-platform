/**
 * Kicks off the QBO OAuth handshake. Generates a fresh `state` (set as
 * an httpOnly cookie) and 302s to Intuit's consent screen. The callback
 * route validates that the cookie matches the returned state.
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { quickbooksOauthConfigured } from "@/lib/env";
import { buildAuthorizationUrl } from "@/lib/integrations/quickbooks/oauth";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE = "qbo_oauth_state";

export async function GET(_request: NextRequest) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.QUICKBOOKS_MANAGE);

  if (!quickbooksOauthConfigured()) {
    return NextResponse.json(
      {
        error:
          "QuickBooks OAuth is not configured. Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, and QBO_ENCRYPTION_KEY.",
      },
      { status: 503 },
    );
  }

  const state = randomBytes(24).toString("base64url");
  const cookieJar = await cookies();
  cookieJar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes is plenty for an OAuth round trip
  });

  await writeAuditLog({
    eventType: "qbo.oauth.initiated",
    eventCategory: "system",
    severity: "info",
    action: "initiate",
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "quickbooks_connection",
  });

  return NextResponse.redirect(buildAuthorizationUrl(state));
}
