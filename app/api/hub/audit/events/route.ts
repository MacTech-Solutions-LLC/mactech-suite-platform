import { NextResponse, type NextRequest } from "next/server";
import { auditIngestSchema } from "@/lib/validations/audit";
import {
  appendHubAuditEvent,
  auditErrorResponse,
  verifyAuditServiceRequest,
} from "@/lib/hub-audit";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = auditIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const sourceAppKey = input.sourceAppKey ?? input.appKey ?? null;
  const service = await verifyAuditServiceRequest(request, sourceAppKey);
  if (!service.ok) {
    return NextResponse.json(
      { error: service.error, detail: service.detail },
      { status: service.status },
    );
  }

  let organizationId = input.organizationId ?? input.customerOrgId ?? null;
  if (!organizationId && input.customerOrgClerkId) {
    const org = await prisma.customerOrganization.findUnique({
      where: { clerkOrgId: input.customerOrgClerkId },
      select: { id: true },
    });
    organizationId = org?.id ?? null;
  }

  let actorHubUserId = input.actorHubUserId ?? null;
  if (!actorHubUserId && input.actorClerkUserId) {
    const user = await prisma.userProfile.findUnique({
      where: { clerkUserId: input.actorClerkUserId },
      select: { id: true },
    });
    actorHubUserId = user?.id ?? null;
  }

  try {
    const row = await appendHubAuditEvent({
      sourceAppKey: service.sourceAppKey,
      eventType: input.eventType,
      eventCategory: input.eventCategory,
      severity: input.severity,
      action: input.action,
      actorHubUserId,
      actorClerkUserId: input.actorClerkUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      actorServiceId: service.serviceIdentityId,
      organizationId,
      tenantOrgId: input.tenantOrgId ?? organizationId,
      objectType: input.objectType ?? input.resourceType ?? null,
      objectId: input.objectId ?? input.resourceId ?? null,
      objectVersion: input.objectVersion ?? null,
      objectHash: input.objectHash ?? null,
      suiteObjectReferenceId: input.suiteObjectReferenceId ?? null,
      requestId: input.requestId ?? request.headers.get("x-request-id"),
      ipAddress: getIp(request),
      userAgent: request.headers.get("user-agent"),
      beforeJson: input.beforeJson ?? null,
      afterJson: input.afterJson ?? null,
      metadataJson: input.metadataJson ?? input.metadata ?? null,
    });

    return NextResponse.json(
      {
        ok: true,
        id: row.id,
        sequenceNumber: row.sequenceNumber,
        currentHash: row.currentHash,
      },
      { status: 201 },
    );
  } catch (error) {
    return auditErrorResponse(error);
  }
}

function getIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
