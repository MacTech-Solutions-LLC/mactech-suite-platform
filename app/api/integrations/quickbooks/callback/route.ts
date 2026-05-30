/**
 * OAuth callback target Intuit redirects to with ?code=&realmId=&state=.
 *
 * On success we exchange the code for tokens, persist them encrypted,
 * and redirect the operator back to /admin/quickbooks with a status query.
 * On failure we redirect with ?error= so the page can show a banner.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { env, quickbooksOauthConfigured } from "@/lib/env";
import { exchangeCodeForTokens, QBO_SCOPES } from "@/lib/integrations/quickbooks/oauth";
import { persistTokens } from "@/lib/integrations/quickbooks/connection-service";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE = "qbo_oauth_state";
const ADMIN_PATH = "/admin/quickbooks";

function adminUrl(query: Record<string, string>): URL {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = new URL(`${base}${ADMIN_PATH}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url;
}

export async function GET(request: NextRequest) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.QUICKBOOKS_MANAGE);

  if (!quickbooksOauthConfigured()) {
    return NextResponse.redirect(adminUrl({ error: "not_configured" }));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // Intuit appends ?error= when the user denies consent.
  if (oauthError) {
    await writeAuditLog({
      eventType: "qbo.oauth.denied",
      eventCategory: "system",
      severity: "warning",
      action: "callback",
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      resourceType: "quickbooks_connection",
      metadata: { reason: oauthError },
    });
    return NextResponse.redirect(adminUrl({ error: oauthError }));
  }

  if (!code || !realmId || !state) {
    return NextResponse.redirect(adminUrl({ error: "missing_params" }));
  }

  const cookieJar = await cookies();
  const expectedState = cookieJar.get(STATE_COOKIE)?.value;
  // Clear the cookie either way — state is single-use.
  cookieJar.delete(STATE_COOKIE);

  if (!expectedState || expectedState !== state) {
    await writeAuditLog({
      eventType: "qbo.oauth.state_mismatch",
      eventCategory: "security",
      severity: "warning",
      action: "callback",
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      resourceType: "quickbooks_connection",
    });
    return NextResponse.redirect(adminUrl({ error: "state_mismatch" }));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const row = await persistTokens({
      realmId,
      environment: env.QBO_ENV,
      tokens,
      connectedByClerkUserId: ctx.clerkUserId,
      // Record the scopes just granted so the UI knows whether the Payments
      // (charge card/ACH) capability is available without re-consent.
      scope: QBO_SCOPES,
    });

    await writeAuditLog({
      eventType: "qbo.oauth.connected",
      eventCategory: "system",
      severity: "info",
      action: "connect",
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      resourceType: "quickbooks_connection",
      resourceId: row.id,
      metadata: { realmId, environment: env.QBO_ENV },
    });

    return NextResponse.redirect(adminUrl({ connected: "1" }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await writeAuditLog({
      eventType: "qbo.oauth.exchange_failed",
      eventCategory: "system",
      severity: "warning",
      action: "callback",
      actorClerkUserId: ctx.clerkUserId,
      actorEmail: ctx.userProfile.email,
      actorUserProfileId: ctx.userProfile.id,
      resourceType: "quickbooks_connection",
      metadata: { message },
    });
    return NextResponse.redirect(adminUrl({ error: "exchange_failed" }));
  }
}
