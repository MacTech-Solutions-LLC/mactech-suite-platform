/**
 * Operator-triggered disconnect. Marks the active connection inactive and
 * best-effort revokes the refresh token with Intuit. The DB row is kept
 * for audit history.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  deactivateConnection,
  getActiveConnection,
} from "@/lib/integrations/quickbooks/connection-service";
import { decryptToken } from "@/lib/integrations/quickbooks/encryption";
import { revokeRefreshToken } from "@/lib/integrations/quickbooks/oauth";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.QUICKBOOKS_MANAGE);

  const connection = await getActiveConnection();
  if (!connection) {
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  try {
    const refresh = decryptToken(connection.refreshTokenCipher);
    await revokeRefreshToken(refresh);
  } catch {
    // If decrypt fails (e.g. key rotated mid-session) we still deactivate.
  }

  await deactivateConnection(connection.id);

  await writeAuditLog({
    eventType: "qbo.oauth.disconnected",
    eventCategory: "system",
    severity: "info",
    action: "disconnect",
    actorClerkUserId: ctx.clerkUserId,
    actorEmail: ctx.userProfile.email,
    actorUserProfileId: ctx.userProfile.id,
    resourceType: "quickbooks_connection",
    resourceId: connection.id,
    metadata: { realmId: connection.realmId },
  });

  return NextResponse.json({ ok: true });
}
