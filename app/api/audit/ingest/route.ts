import { NextResponse, type NextRequest } from "next/server";
import { auditIngestSchema } from "@/lib/validations/audit";
import { writeAuditLog } from "@/lib/audit";
import { env, auditIngestionConfigured } from "@/lib/env";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!auditIngestionConfigured()) {
    return NextResponse.json(
      { error: "Audit ingestion is not configured on this server." },
      { status: 503 },
    );
  }

  const providedKey =
    request.headers.get("x-mactech-audit-key") ??
    request.headers.get("X-MacTech-Audit-Key");
  if (!providedKey || providedKey !== env.AUDIT_INGEST_API_KEY) {
    return NextResponse.json(
      { error: "Unauthorized: invalid or missing audit ingestion key." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = auditIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const app = await prisma.appRegistry.findUnique({ where: { appKey: input.appKey } });
  if (!app) {
    return NextResponse.json(
      { error: `Unknown appKey: ${input.appKey}` },
      { status: 404 },
    );
  }

  let customerOrganizationId = input.customerOrgId ?? null;
  if (!customerOrganizationId && input.customerOrgClerkId) {
    const org = await prisma.customerOrganization.findUnique({
      where: { clerkOrgId: input.customerOrgClerkId },
      select: { id: true },
    });
    customerOrganizationId = org?.id ?? null;
  }

  let actorUserProfileId: string | null = null;
  if (input.actorClerkUserId) {
    const profile = await prisma.userProfile.findUnique({
      where: { clerkUserId: input.actorClerkUserId },
      select: { id: true },
    });
    actorUserProfileId = profile?.id ?? null;
  }

  const log = await writeAuditLog({
    eventType: input.eventType,
    eventCategory: input.eventCategory,
    severity: input.severity,
    action: input.action,
    actorClerkUserId: input.actorClerkUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    actorUserProfileId,
    customerOrganizationId,
    appRegistryId: app.id,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    requestId: input.requestId ?? null,
    ipAddress: getIp(request),
    userAgent: request.headers.get("user-agent"),
    metadata:
      input.metadata != null
        ? (input.metadata as unknown as import("@prisma/client").Prisma.InputJsonValue)
        : null,
  });

  return NextResponse.json({ ok: true, id: log.id }, { status: 201 });
}

function getIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
