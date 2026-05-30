import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import { createAuditExportManifest } from "@/lib/hub-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const ctx = await requirePlatformPermission(PLATFORM_PERMISSIONS.AUDIT_LOGS_VIEW);
  const { searchParams } = request.nextUrl;
  const appKeys = searchParams.getAll("appKey").filter(Boolean);
  const manifest = await createAuditExportManifest({
    startDate: searchParams.get("start") ? new Date(searchParams.get("start")!) : null,
    endDate: searchParams.get("end") ? new Date(searchParams.get("end")!) : null,
    appKeys,
    signerIdentity: `hub-user:${ctx.userProfile.id}`,
  });

  return NextResponse.json({ ok: true, manifest });
}
