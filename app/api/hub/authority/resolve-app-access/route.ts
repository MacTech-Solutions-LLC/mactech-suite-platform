import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  resolveHubAppAccess,
  verifyHubServiceRequest,
} from "@/lib/hub-authority";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const serviceMetadataSchema = z.object({
  sourceAppKey: z.string().min(1).max(80),
  serviceIdentityId: z.string().optional().nullable(),
  keyId: z.string().optional().nullable(),
  authMethod: z.enum(["service_token", "signed_request"]).default("service_token"),
});

const resolveAppAccessSchema = z.object({
  clerkUserId: z.string().min(1).max(200),
  appKey: z.string().min(1).max(80),
  requestedOrgId: z.string().min(1).max(200).optional().nullable(),
  tenantOrgId: z.string().min(1).max(200).optional().nullable(),
  requestId: z.string().min(1).max(200).optional().nullable(),
  sourceIp: z.string().max(200).optional().nullable(),
  userAgent: z.string().max(500).optional().nullable(),
  service: serviceMetadataSchema,
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = resolveAppAccessSchema.safeParse(body);
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

  const input = {
    ...parsed.data,
    sourceIp: parsed.data.sourceIp ?? getIp(request),
    userAgent: parsed.data.userAgent ?? request.headers.get("user-agent"),
  };

  const service = await verifyHubServiceRequest(request, input.service.sourceAppKey);
  if (!service.ok) {
    return NextResponse.json(
      { error: service.error, detail: service.detail },
      { status: service.status },
    );
  }

  const snapshot = await resolveHubAppAccess(
    {
      ...input,
      service: {
        sourceAppKey: service.sourceAppKey,
        serviceIdentityId: service.serviceIdentityId,
        keyId: service.keyId,
        authMethod: "service_token",
      },
    },
    service,
  );

  return NextResponse.json({ ok: true, snapshot }, { status: snapshot.decision.allow ? 200 : 403 });
}

function getIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
